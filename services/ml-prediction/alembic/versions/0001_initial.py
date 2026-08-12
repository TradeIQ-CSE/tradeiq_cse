"""0001_initial — ml schema (3 tables).

Source: tradeiq_cse_schema_v2.sql (07 Aug 2026),
verified 1:1 against ERD v2 (docs/diagrams/fig14-erd-v2.json).

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-10
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS ml")

    op.execute("""
        CREATE TABLE ml.models (
            model_id          uuid PRIMARY KEY,
            name              varchar(100) NOT NULL,
            version           varchar(30) NOT NULL,
            algorithm         varchar(50),
            trained_at        timestamptz,
            metrics           jsonb,
            is_active         boolean NOT NULL DEFAULT false,
            CONSTRAINT models_version_uq UNIQUE (name, version)
        )
    """)

    op.execute("""
        CREATE TABLE ml.prediction_runs (
            run_id            uuid PRIMARY KEY,
            model_id          uuid NOT NULL REFERENCES ml.models(model_id),
            prediction_date   date NOT NULL,
            data_as_of        date NOT NULL,
            status            varchar(20) NOT NULL DEFAULT 'running',
            completed_at      timestamptz,
            CONSTRAINT pred_runs_status_chk CHECK (status IN ('running','succeeded','failed')),
            CONSTRAINT pred_runs_uq UNIQUE (model_id, prediction_date)
        )
    """)

    op.execute("""
        CREATE TABLE ml.predictions (
            prediction_id       uuid PRIMARY KEY,
            run_id              uuid NOT NULL REFERENCES ml.prediction_runs(run_id)
                                ON DELETE CASCADE,
            security_id         uuid NOT NULL,
            prediction_date     date NOT NULL,
            prob_up             numeric(5,4) NOT NULL,
            prob_flat           numeric(5,4) NOT NULL,
            prob_down           numeric(5,4) NOT NULL,
            predicted_direction varchar(5) NOT NULL,
            CONSTRAINT predictions_uq UNIQUE (run_id, security_id),
            CONSTRAINT predictions_direction_chk
                CHECK (predicted_direction IN ('up','flat','down')),
            CONSTRAINT predictions_prob_range_chk CHECK (
                prob_up BETWEEN 0 AND 1
                AND prob_flat BETWEEN 0 AND 1
                AND prob_down BETWEEN 0 AND 1
            ),
            CONSTRAINT predictions_prob_sum_chk
                CHECK (abs(prob_up + prob_flat + prob_down - 1) < 0.001)
        )
    """)
    op.execute(
        "CREATE INDEX idx_predictions_security_date "
        "ON ml.predictions(security_id, prediction_date DESC)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ml.predictions")
    op.execute("DROP TABLE IF EXISTS ml.prediction_runs")
    op.execute("DROP TABLE IF EXISTS ml.models")
    op.execute("DROP SCHEMA IF EXISTS ml")
