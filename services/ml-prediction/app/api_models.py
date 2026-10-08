"""Public response schemas for saved long-trade results."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

RunStatus = Literal["running", "succeeded", "partial", "failed"]


class Configuration(BaseModel):
    config_key: str
    take_profit_pct: float = Field(gt=0, lt=1, description="Fractional target: 0.015 means 1.5%")
    stop_loss_pct: float = Field(
        gt=0, lt=1, description="Fractional loss barrier: 0.0075 means 0.75%"
    )
    horizon_bars: int = Field(gt=0, le=2147483647, description="Prediction horizon in trading bars")
    test_days: int = Field(gt=0, le=2147483647, description="Labeled bars held out for evaluation")


class ConfigurationCatalog(BaseModel):
    configurations: list[Configuration]
    default_config_key: str | None


class ConfigurationsResponse(BaseModel):
    data: ConfigurationCatalog


class BatchSummary(BaseModel):
    run_id: UUID
    status: RunStatus
    started_at: datetime
    completed_at: datetime | None
    data_as_of: date | None
    symbols_requested: int
    models_trained: int
    models_skipped: int
    models_failed: int


class Prediction(BaseModel):
    prediction_id: UUID
    symbol: str
    configuration: Configuration
    prob_long: float = Field(
        ge=0, le=1, description="Saved probability of reaching the profit barrier first"
    )
    is_long_signal: bool = Field(
        description="Saved signal; never recompute from rounded probability"
    )
    confidence_margin: float
    data_as_of: date = Field(description="Last input bar date for this security result")
    generated_at: datetime = Field(description="Completion time of the producing batch")
    model_version: str
    batch: BatchSummary


class PredictionSelection(BaseModel):
    symbol: str
    config_key: str | None
    prediction: Prediction | None
    availability: Literal["available", "no_completed_batch", "no_prediction"]


class PredictionResponse(BaseModel):
    data: PredictionSelection


class BatchAvailability(BaseModel):
    latest_run: BatchSummary | None
    latest_completed_run: BatchSummary | None


class StatusResponse(BaseModel):
    data: BatchAvailability


class ErrorField(BaseModel):
    field: str
    reason: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    trace_id: str
    fields: list[ErrorField] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
