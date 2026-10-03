# Copied verbatim from trading-wizard (github.com/Meelan-98/trading-wizard),
# services/indicator_engine.py at commit 321fa67. The long-trade model was
# researched against exactly this feature code, so keep it diffable with
# upstream: the only edit is the import order ruff requires (numpy and pandas
# swapped). Port any upstream fix here deliberately, and re-run the parity
# check (services/ml-prediction/README.md) when you do.
import numpy as np
import pandas as pd


class IndicatorEngine:

    def __init__(self):

        self.EPS = 1e-8
        self.TRUE_RANGE_PERIOD = 14

        self.volatility_indicators = [
            "body_pct",
            "range_pct",
            "upper_wick_pct",
            "lower_wick_pct",
            "atr_14_pct",
            "atr_28_pct",
            "atr_zscore_100",
            "realized_vol_10",
            "realized_vol_20",
            "realized_vol_ratio",
            "vol_of_vol_20",
            "bb_bandwidth",
            "bb_percent_b",
            "bb_bandwidth_z",
            "range_expansion_14",
            "volatility_compression_50",
            "chop_14",
        ]

        self.directional_indicators = [
            "log_return_1",
            "log_return_3",
            "log_return_6",
            "ema_fast_norm",
            "ema_slow_norm",
            "ema_50_norm",
            "ema_200_norm",
            "ema_diff_norm",
            "ema_9_21_spread_z",
            "ema_21_50_spread_z",
            "ema_fast_slope_norm",
            "ema_21_slope_norm",
            "ema_50_slope_norm",
            "sma_fast_norm",
            "sma_diff_norm",
            "macd_normalised",
            "macd_hist_normalised",
            "+DI",
            "-DI",
            "adx",
            "di_spread",
            "vwap_normalised",
            "vwap_slope_norm",
            "trend_persistence_10",
            "rolling_high_20_dist",
            "rolling_low_20_dist",
            "price_trend_ratio_50",
        ]

        self.momentum_indicators = [
            "rsi14_normalized",
            "rsi14_slope",
            "rsi14_accel",
            "rsi_28_normalized",
            "rsi_regime_z",
            "stoch_rsi_14",
            "roc_5",
            "roc_10",
            "roc_ratio",
            "distance_from_rsi_mid",
            "vol_adjusted_momentum",
            "rv_12",
        ]

        self.volume_indicators = [
            "volume_ratio",
            "volume_zscore_100",
            "volume_acceleration",
            "buy_volume_ratio",
            "volume_delta",
            "volume_delta_ratio",
            "ofi_zscore_50",
            "avg_trade_size",
            "trade_size_ratio",
            "trades_sma12",
            "trades_ratio",
            "volume_volatility_ratio",
            "volume_pressure_score",
        ]

        self.fibonacci_indicators = [
            "range_position_30",
            "range_position_60",
            "fib_23_dist_30",
            "fib_38_dist_30",
            "fib_50_dist_30",
            "fib_61_dist_30",
            "fib_78_dist_30",
            "fib_extension_127_30",
            "fib_extension_161_30",
            "fib_50_dist_60",
            "swing_breakout_30",
        ]

    def add_volatility_indicators(self, df):

        # =========================
        # Candle Structure
        # =========================

        rolling_mean_14 = df["close"].rolling(14).mean()

        df["range_pct"] = (df["high"] - df["low"]) / (rolling_mean_14 + self.EPS)
        df["body_pct"] = (df["close"] - df["open"]) / (rolling_mean_14 + self.EPS)

        df["upper_wick_pct"] = (df["high"] - df[["open", "close"]].max(axis=1)) / (
            rolling_mean_14 + self.EPS
        )
        df["lower_wick_pct"] = (df[["open", "close"]].min(axis=1) - df["low"]) / (
            rolling_mean_14 + self.EPS
        )

        # =========================
        # ATR (Multi-Horizon + Normalization)
        # =========================

        high_low = df["high"] - df["low"]
        high_close = (df["high"] - df["close"].shift()).abs()
        low_close = (df["low"] - df["close"].shift()).abs()

        df["true_range"] = pd.concat([high_low, high_close, low_close], axis=1).max(
            axis=1
        )

        df["atr_14"] = (
            df["true_range"].ewm(span=self.TRUE_RANGE_PERIOD, adjust=False).mean()
        )
        df["atr_28"] = df["true_range"].ewm(span=28, adjust=False).mean()

        df["atr_14_pct"] = df["atr_14"] / (df["close"] + self.EPS)
        df["atr_28_pct"] = df["atr_28"] / (df["close"] + self.EPS)

        # Regime adaptive ATR
        atr_mean_100 = df["atr_14"].rolling(100).mean()
        atr_std_100 = df["atr_14"].rolling(100).std()

        df["atr_zscore_100"] = (df["atr_14"] - atr_mean_100) / (atr_std_100 + self.EPS)

        # =========================
        # Realized Volatility (Return-Based)
        # =========================

        log_ret = np.log(df["close"] / df["close"].shift(1))

        df["realized_vol_10"] = log_ret.rolling(10).std()
        df["realized_vol_20"] = log_ret.rolling(20).std()

        df["realized_vol_ratio"] = df["realized_vol_10"] / (
            df["realized_vol_20"] + self.EPS
        )

        # =========================
        # Volatility of Volatility
        # =========================

        df["vol_of_vol_20"] = df["realized_vol_20"].rolling(20).std()

        # =========================
        # Bollinger Bands
        # =========================

        bollinger_window = 20
        std_factor = 2

        df["bb_middle"] = df["close"].rolling(bollinger_window).mean()
        df["bb_std"] = df["close"].rolling(bollinger_window).std()

        df["bb_upper"] = df["bb_middle"] + std_factor * df["bb_std"]
        df["bb_lower"] = df["bb_middle"] - std_factor * df["bb_std"]

        df["bb_bandwidth"] = (df["bb_upper"] - df["bb_lower"]) / (
            df["bb_middle"] + self.EPS
        )

        # Position inside bands
        df["bb_percent_b"] = (df["close"] - df["bb_lower"]) / (
            df["bb_upper"] - df["bb_lower"] + self.EPS
        )

        # Regime normalized bandwidth
        bb_bw_mean_100 = df["bb_bandwidth"].rolling(100).mean()
        bb_bw_std_100 = df["bb_bandwidth"].rolling(100).std()

        df["bb_bandwidth_z"] = (df["bb_bandwidth"] - bb_bw_mean_100) / (
            bb_bw_std_100 + self.EPS
        )

        # =========================
        # Range Expansion Pressure
        # =========================

        rolling_range_14 = df["high"].rolling(14).max() - df["low"].rolling(14).min()
        df["range_expansion_14"] = (df["high"] - df["low"]) / (
            rolling_range_14 + self.EPS
        )

        # =========================
        # Volatility Compression (Pre-Breakout Detector)
        # =========================

        rolling_vol_50 = df["realized_vol_20"].rolling(50).mean()
        df["volatility_compression_50"] = df["realized_vol_20"] / (
            rolling_vol_50 + self.EPS
        )

        # =========================
        # Choppiness Index
        # =========================

        atr_sum = df["atr_14"].rolling(self.TRUE_RANGE_PERIOD).sum()
        rng = (
            df["high"].rolling(self.TRUE_RANGE_PERIOD).max()
            - df["low"].rolling(self.TRUE_RANGE_PERIOD).min()
        )

        df["chop_14"] = (
            100
            * np.log10(atr_sum / (rng + self.EPS))
            / np.log10(self.TRUE_RANGE_PERIOD)
        )
        df["chop_14"] = df["chop_14"].clip(0, 100)

        df._consolidate_inplace()

        return df

    def add_directional_indicators(self, df):

        # =========================
        # Log Returns
        # =========================

        df["log_return_1"] = np.log(df["close"] / df["close"].shift(1)).clip(
            -0.05, 0.05
        )
        df["log_return_3"] = np.log(df["close"] / df["close"].shift(3)).clip(-0.1, 0.1)
        df["log_return_6"] = np.log(df["close"] / df["close"].shift(6)).clip(
            -0.15, 0.15
        )

        # =========================
        # EMA Structure
        # =========================

        df["ema_fast"] = df["close"].ewm(span=9, adjust=False).mean()
        df["ema_slow"] = df["close"].ewm(span=21, adjust=False).mean()
        df["ema_50"] = df["close"].ewm(span=50, adjust=False).mean()
        df["ema_200"] = df["close"].ewm(span=200, adjust=False).mean()

        df["ema_fast_norm"] = (df["ema_fast"] - df["close"]) / (df["close"] + self.EPS)
        df["ema_slow_norm"] = (df["ema_slow"] - df["close"]) / (df["close"] + self.EPS)
        df["ema_50_norm"] = (df["ema_50"] - df["close"]) / (df["close"] + self.EPS)
        df["ema_200_norm"] = (df["ema_200"] - df["close"]) / (df["close"] + self.EPS)

        df["ema_diff_norm"] = (df["ema_fast"] - df["ema_slow"]) / (
            df["ema_slow"] + self.EPS
        )

        # EMA slopes
        df["ema_fast_slope_norm"] = df["ema_fast"].pct_change().clip(-0.1, 0.1)
        df["ema_21_slope_norm"] = df["ema_slow"].pct_change().clip(-0.05, 0.05)
        df["ema_50_slope_norm"] = df["ema_50"].pct_change().clip(-0.05, 0.05)

        # Z-score spreads (regime adaptive)
        ema_9_21_spread = df["ema_fast"] - df["ema_slow"]
        ema_21_50_spread = df["ema_slow"] - df["ema_50"]

        df["ema_9_21_spread_z"] = (
            ema_9_21_spread - ema_9_21_spread.rolling(100).mean()
        ) / (ema_9_21_spread.rolling(100).std() + self.EPS)

        df["ema_21_50_spread_z"] = (
            ema_21_50_spread - ema_21_50_spread.rolling(100).mean()
        ) / (ema_21_50_spread.rolling(100).std() + self.EPS)

        # =========================
        # SMA
        # =========================

        df["sma_fast"] = df["close"].rolling(window=9, min_periods=9).mean()
        df["sma_slow"] = df["close"].rolling(window=21, min_periods=21).mean()

        df["sma_fast_norm"] = (df["sma_fast"] - df["close"]) / (df["close"] + self.EPS)
        df["sma_diff_norm"] = (df["sma_fast"] - df["sma_slow"]) / (
            df["sma_slow"] + self.EPS
        )

        # =========================
        # MACD
        # =========================

        df["ema_12"] = df["close"].ewm(span=12, adjust=False).mean()
        df["ema_26"] = df["close"].ewm(span=26, adjust=False).mean()

        df["macd"] = df["ema_12"] - df["ema_26"]
        df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
        df["macd_hist"] = df["macd"] - df["macd_signal"]

        df["macd_normalised"] = df["macd"] / (df["close"] + self.EPS)
        df["macd_hist_normalised"] = df["macd_hist"] / (df["close"] + self.EPS)

        # =========================
        # ADX / DI
        # =========================

        up_move = df["high"] - df["high"].shift(1)
        down_move = df["low"].shift(1) - df["low"]

        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0)

        plus_dm = pd.Series(plus_dm, index=df.index)
        minus_dm = pd.Series(minus_dm, index=df.index)

        df["+DI"] = (
            100
            * plus_dm.ewm(span=self.TRUE_RANGE_PERIOD, adjust=False).mean()
            / (df["atr_14"] + self.EPS)
        )
        df["-DI"] = (
            100
            * minus_dm.ewm(span=self.TRUE_RANGE_PERIOD, adjust=False).mean()
            / (df["atr_14"] + self.EPS)
        )

        dx = 100 * (np.abs(df["+DI"] - df["-DI"]) / (df["+DI"] + df["-DI"] + self.EPS))
        df["adx"] = (
            dx.ewm(span=self.TRUE_RANGE_PERIOD, adjust=False).mean().clip(0, 100)
        )

        df["di_spread"] = (df["+DI"] - df["-DI"]) / (df["+DI"] + df["-DI"] + self.EPS)

        # =========================
        # VWAP (Daily Reset)
        # =========================

        df["vwap"] = (df["close"] * df["volume"]).groupby(df["date"]).cumsum() / (
            df["volume"].groupby(df["date"]).cumsum() + self.EPS
        )

        df["vwap_normalised"] = df["vwap"] / (df["close"] + self.EPS)
        df["vwap_slope_norm"] = df["vwap"].pct_change().clip(-0.05, 0.05)

        # =========================
        # Trend Persistence
        # =========================

        direction = np.sign(df["log_return_1"])
        df["trend_persistence_10"] = direction.rolling(10).sum() / 10

        # =========================
        # Breakout Distance
        # =========================

        rolling_high_20 = df["high"].rolling(20).max()
        rolling_low_20 = df["low"].rolling(20).min()

        df["rolling_high_20_dist"] = (df["close"] - rolling_high_20) / (
            rolling_high_20 + self.EPS
        )
        df["rolling_low_20_dist"] = (df["close"] - rolling_low_20) / (
            rolling_low_20 + self.EPS
        )

        # =========================
        # Regime Filter
        # =========================

        rolling_mean_50 = df["close"].rolling(50).mean()
        rolling_std_50 = df["close"].rolling(50).std()

        df["price_trend_ratio_50"] = (rolling_mean_50 - rolling_mean_50.shift(10)) / (
            rolling_std_50 + self.EPS
        )

        df._consolidate_inplace()

        return df

    def add_momentum_indicators(self, df):

        # =========================
        # RSI 14 (EMA-smoothed)
        # =========================

        delta = df["close"].diff()

        gain = delta.clip(lower=0)
        loss = -delta.clip(upper=0)

        avg_gain = gain.ewm(alpha=1 / 14, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1 / 14, adjust=False).mean()

        rs = avg_gain / (avg_loss + self.EPS)
        df["rsi_14"] = 100 - (100 / (1 + rs))

        df["rsi14_normalized"] = (df["rsi_14"] / 100).clip(0, 1)

        # =========================
        # RSI Momentum Structure
        # =========================

        # Slope (1st derivative)
        df["rsi14_slope"] = df["rsi_14"].diff().clip(-20, 20) / 100.0

        # Acceleration (2nd derivative)
        df["rsi14_accel"] = df["rsi14_slope"].diff().clip(-0.5, 0.5)

        # Longer RSI (regime context)
        avg_gain_28 = gain.ewm(alpha=1 / 28, adjust=False).mean()
        avg_loss_28 = loss.ewm(alpha=1 / 28, adjust=False).mean()
        rs_28 = avg_gain_28 / (avg_loss_28 + self.EPS)

        df["rsi_28"] = 100 - (100 / (1 + rs_28))
        df["rsi_28_normalized"] = (df["rsi_28"] / 100).clip(0, 1)

        # Regime-adaptive RSI (Z-score over rolling window)
        rsi_mean_100 = df["rsi_14"].rolling(100).mean()
        rsi_std_100 = df["rsi_14"].rolling(100).std()

        df["rsi_regime_z"] = (df["rsi_14"] - rsi_mean_100) / (rsi_std_100 + self.EPS)

        # =========================
        # Stochastic RSI
        # =========================

        min_rsi = df["rsi_14"].rolling(14).min()
        max_rsi = df["rsi_14"].rolling(14).max()

        df["stoch_rsi_14"] = (
            (df["rsi_14"] - min_rsi) / (max_rsi - min_rsi + self.EPS)
        ).clip(0, 1)

        # =========================
        # Rate of Change (True Momentum)
        # =========================

        df["roc_5"] = (df["close"] / df["close"].shift(5) - 1).clip(-0.2, 0.2)
        df["roc_10"] = (df["close"] / df["close"].shift(10) - 1).clip(-0.3, 0.3)

        df["roc_ratio"] = df["roc_5"] / (df["roc_10"] + self.EPS)

        # =========================
        # Mean Reversion Pressure
        # =========================

        df["distance_from_rsi_mid"] = (df["rsi_14"] - 50) / 50.0

        # =========================
        # Realized Volatility (Short-Term)
        # =========================

        df["rv_12"] = df["log_return_1"].rolling(12).std().clip(0, 0.05)

        # =========================
        # Volatility-Adjusted Momentum
        # =========================

        # Uses realized vol from volatility block
        df["vol_adjusted_momentum"] = (
            df["log_return_1"] / (df["rv_12"] + self.EPS)
        ).clip(-5, 5)

        df._consolidate_inplace()

        return df

    def add_volume_indicators(self, df):

        # =========================
        # Volume Regime
        # =========================

        df["volume_sma20"] = df["volume"].rolling(20).mean()

        df["volume_ratio"] = (df["volume"] / (df["volume_sma20"] + self.EPS)).clip(0, 5)

        # Regime-normalized volume
        vol_mean_100 = df["volume"].rolling(100).mean()
        vol_std_100 = df["volume"].rolling(100).std()

        df["volume_zscore_100"] = (df["volume"] - vol_mean_100) / (
            vol_std_100 + self.EPS
        )

        # Volume acceleration
        df["volume_acceleration"] = (df["volume_ratio"].diff()).clip(-5, 5)

        # =========================
        # Order Flow Imbalance
        # =========================

        # Buy volume ratio (taker buy base asset volume assumed)
        df["buy_volume_ratio"] = (df["tbba_volume"] / (df["volume"] + self.EPS)).clip(
            0, 1
        )

        # Raw delta
        df["volume_delta"] = df["tbba_volume"] - (df["volume"] - df["tbba_volume"])

        # Normalized delta
        df["volume_delta_ratio"] = (
            df["volume_delta"] / (df["volume"] + self.EPS)
        ).clip(-1, 1)

        # Order flow imbalance z-score
        ofi_mean_50 = df["volume_delta_ratio"].rolling(50).mean()
        ofi_std_50 = df["volume_delta_ratio"].rolling(50).std()

        df["ofi_zscore_50"] = (df["volume_delta_ratio"] - ofi_mean_50) / (
            ofi_std_50 + self.EPS
        )

        # =========================
        # Trade Participation Structure
        # =========================

        df["avg_trade_size"] = df["volume"] / (df["trades_count"] + self.EPS)

        trade_size_mean_50 = df["avg_trade_size"].rolling(50).mean()

        df["trade_size_ratio"] = (
            df["avg_trade_size"] / (trade_size_mean_50 + self.EPS)
        ).clip(0, 5)

        df["trades_sma12"] = df["trades_count"].rolling(12).mean()

        df["trades_ratio"] = (
            df["trades_count"] / (df["trades_sma12"] + self.EPS)
        ).clip(0, 5)

        # =========================
        # Volume–Volatility Interaction
        # =========================

        # Requires realized_vol_20 from volatility block
        df["volume_volatility_ratio"] = (
            df["volume_ratio"] / (df["realized_vol_20"] + self.EPS)
        ).clip(0, 50)

        # Composite pressure score (flow * volume regime)
        df["volume_pressure_score"] = (
            df["volume_ratio"] * df["volume_delta_ratio"]
        ).clip(-5, 5)

        df._consolidate_inplace()

        return df

    def add_fibonacci_indicators(self, df):

        # =========================
        # 30-Period Swing
        # =========================

        rolling_high_30 = df["close"].rolling(30).max()
        rolling_low_30 = df["close"].rolling(30).min()

        swing_30 = rolling_high_30 - rolling_low_30 + self.EPS

        # Position inside swing [0,1]
        df["range_position_30"] = ((df["close"] - rolling_low_30) / swing_30).clip(0, 1)

        # =========================
        # Fibonacci Retracement (30)
        # =========================

        fib_23 = rolling_high_30 - 0.236 * swing_30
        fib_38 = rolling_high_30 - 0.382 * swing_30
        fib_50 = rolling_high_30 - 0.5 * swing_30
        fib_61 = rolling_high_30 - 0.618 * swing_30
        fib_78 = rolling_high_30 - 0.786 * swing_30

        df["fib_23_dist_30"] = (df["close"] - fib_23) / swing_30
        df["fib_38_dist_30"] = (df["close"] - fib_38) / swing_30
        df["fib_50_dist_30"] = (df["close"] - fib_50) / swing_30
        df["fib_61_dist_30"] = (df["close"] - fib_61) / swing_30
        df["fib_78_dist_30"] = (df["close"] - fib_78) / swing_30

        # =========================
        # Fibonacci Extensions (Breakout Pressure)
        # =========================

        fib_ext_127 = rolling_high_30 + 1.272 * swing_30
        fib_ext_161 = rolling_high_30 + 1.618 * swing_30

        df["fib_extension_127_30"] = (df["close"] - fib_ext_127) / swing_30

        df["fib_extension_161_30"] = (df["close"] - fib_ext_161) / swing_30

        # =========================
        # 60-Period Swing (Higher Context)
        # =========================

        rolling_high_60 = df["close"].rolling(60).max()
        rolling_low_60 = df["close"].rolling(60).min()

        swing_60 = rolling_high_60 - rolling_low_60 + self.EPS

        df["range_position_60"] = ((df["close"] - rolling_low_60) / swing_60).clip(0, 1)

        fib_50_60 = rolling_high_60 - 0.5 * swing_60

        df["fib_50_dist_60"] = (df["close"] - fib_50_60) / swing_60

        # =========================
        # Breakout State Encoding
        # =========================

        df["swing_breakout_30"] = np.where(
            df["close"] > rolling_high_30.shift(1),
            1,
            np.where(df["close"] < rolling_low_30.shift(1), -1, 0),
        )

        df._consolidate_inplace()

        return df

    def get_indicator_list(self):

        feature_columns = (
            self.volatility_indicators
            + self.directional_indicators
            + self.momentum_indicators
            + self.volume_indicators
            + self.fibonacci_indicators
        )

        return feature_columns

    def add_all_indicators(self, df):

        df = self.add_volatility_indicators(df)
        df = self.add_directional_indicators(df)
        df = self.add_momentum_indicators(df)
        df = self.add_volume_indicators(df)
        df = self.add_fibonacci_indicators(df)

        return df
