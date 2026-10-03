"""0002_long_trade_predictions — tables for the scheduled long-trade predictor.

ml.predictions (0001) was designed for a three-class PPO up/flat/down contract:
it keys on security_id, which the market REST API deliberately never exposes,
and requires three probabilities summing to 1. The long-trade model is a
binary probability per (symbol, configuration), so it gets its own tables and
0001 stays untouched. The model itself is registered in the existing ml.models.
See docs/adr/0011-long-trade-batch-predictor.md.

Revision ID: 0002_long_trade_predictions
Revises: 0001_initial
Create Date: 2026-10-01
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_long_trade_predictions"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE ml.long_trade_runs (
            run_id              uuid PRIMARY KEY,
            model_id            uuid NOT NULL REFERENCES ml.models(model_id),
            started_at          timestamptz NOT NULL DEFAULT now(),
            completed_at        timestamptz,
            status              varchar(20) NOT NULL DEFAULT 'running',
            data_as_of          date,
            symbols_requested   integer NOT NULL DEFAULT 0,
            models_trained      integer NOT NULL DEFAULT 0,
            models_skipped      integer NOT NULL DEFAULT 0,
            models_failed       integer NOT NULL DEFAULT 0,
            settings            jsonb NOT NULL DEFAULT '{}'::jsonb,
            CONSTRAINT long_trade_runs_status_chk
                CHECK (status IN ('running','succeeded','partial','failed')),
            CONSTRAINT long_trade_runs_counts_chk CHECK (
                symbols_requested >= 0 AND models_trained >= 0
                AND models_skipped >= 0 AND models_failed >= 0
            )
        )
    """)
    op.execute("CREATE INDEX idx_long_trade_runs_started ON ml.long_trade_runs(started_at DESC)")

    op.execute("""
        CREATE TABLE ml.long_trade_predictions (
            prediction_id       uuid PRIMARY KEY,
            run_id              uuid NOT NULL REFERENCES ml.long_trade_runs(run_id)
                                ON DELETE CASCADE,
            symbol              varchar(30) NOT NULL,
            config_key          varchar(64) NOT NULL,
            take_profit_pct     numeric(6,4) NOT NULL,
            stop_loss_pct       numeric(6,4) NOT NULL,
            horizon_bars        integer NOT NULL,
            test_days           integer NOT NULL,
            train_from          date NOT NULL,
            train_to            date NOT NULL,
            data_as_of          date NOT NULL,
            train_rows          integer NOT NULL,
            test_rows           integer NOT NULL,
            positive_rate       numeric(5,4) NOT NULL,
            prob_long           numeric(5,4) NOT NULL,
            is_long_signal      boolean NOT NULL,
            confidence_margin   numeric(4,3) NOT NULL,
            metrics             jsonb NOT NULL DEFAULT '{}'::jsonb,
            created_at          timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT long_trade_predictions_uq UNIQUE (symbol, config_key, data_as_of),
            CONSTRAINT long_trade_predictions_prob_chk CHECK (prob_long BETWEEN 0 AND 1),
            CONSTRAINT long_trade_predictions_positive_rate_chk
                CHECK (positive_rate BETWEEN 0 AND 1),
            CONSTRAINT long_trade_predictions_barriers_chk CHECK (
                take_profit_pct > 0 AND stop_loss_pct > 0
                AND horizon_bars > 0 AND test_days > 0
            ),
            CONSTRAINT long_trade_predictions_window_chk
                CHECK (train_from <= train_to AND data_as_of <= train_to)
        )
    """)
    op.execute(
        "CREATE INDEX idx_long_trade_predictions_symbol_date "
        "ON ml.long_trade_predictions(symbol, data_as_of DESC)"
    )
    # ON DELETE CASCADE from runs, and "which predictions did this run make".
    op.execute("CREATE INDEX idx_long_trade_predictions_run ON ml.long_trade_predictions(run_id)")

    # The two numbers a reader is most likely to misread.
    op.execute("""
        COMMENT ON COLUMN ml.long_trade_predictions.prob_long IS
        'Ensemble P(label=1) for the bar at data_as_of: entering at that close, price reaches '
        '+take_profit_pct before -stop_loss_pct within horizon_bars trading days. Rounded to '
        '4 dp; is_long_signal is decided on the unrounded value.'
    """)
    op.execute("""
        COMMENT ON COLUMN ml.long_trade_predictions.train_rows IS
        'Rows in the evaluation train split. The model behind prob_long is refitted on '
        'train_rows + test_rows labelled rows.'
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ml.long_trade_predictions")
    op.execute("DROP TABLE IF EXISTS ml.long_trade_runs")
    # The model registered in ml.models (0001's table) by the job.
    op.execute("DELETE FROM ml.models WHERE name = 'long-trade-ensemble'")
