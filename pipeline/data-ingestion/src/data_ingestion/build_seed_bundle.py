"""Assemble a seed bundle from a cse-dataset checkout.

``backfill_ohlcv.py`` in cse-dataset writes accepted OHLCV **one file per
trading date**::

    data/raw/ohlcv/accepted/<YYYY-MM-DD>/<source>/canonical_ohlcv.csv

but ``data_ingestion.seed`` expects a bundle holding a **single** consolidated
``daily_ohlcv.csv`` (see ``pipeline/data-ingestion/README.md``). Nothing in
cse-dataset currently bridges the two, so this command does it: concatenate the
per-date accepted files, copy company metadata alongside, and emit a directory
that ``seed.py`` accepts via ``--seed-dir`` / ``CSE_SEED_DATA_DIR``.

The per-date files already carry the canonical ``ohlcv.schema.json`` columns,
so rows pass through unchanged — only `date`/`symbol` are read here, to sort
and to report coverage.

Longer term this arguably belongs upstream in cse-dataset (it owns producing
canonical artifacts); it lives here for now so the consumer isn't blocked.

Usage::

    python -m data_ingestion.build_seed_bundle \
        --dataset-root ~/Documents/tradeiq_cse/cse-dataset \
        --out /tmp/cse-bundle --from 2025-01-01 --to 2025-12-31
"""

from __future__ import annotations

import argparse
import csv
import logging
from datetime import date, datetime
from pathlib import Path

from data_ingestion.seed_data import parse_date

log = logging.getLogger("data_ingestion.build_seed_bundle")

ACCEPTED_SUBPATH = "data/raw/ohlcv/accepted"
METADATA_SUBPATH = "data/processed/company_metadata.csv"

#: cse-dataset's 01_collect_metadata.py passes the CSE API's date strings
#: through unnormalised (e.g. "01/JAN/1984"), but the bundle contract — and
#: seed_data.parse_date — require ISO. Normalise here rather than loosening the
#: canonical parser. Upstream emitting ISO directly would make this a no-op.
METADATA_DATE_COLUMNS = ("listing_date", "delisting_date")
_CSE_API_DATE_FORMAT = "%d/%b/%Y"


def normalise_metadata_date(value: str) -> str:
    """Convert a CSE-API date to ISO. Blank/already-ISO values pass through."""
    text = (value or "").strip()
    if not text:
        return ""
    try:
        return datetime.strptime(text, _CSE_API_DATE_FORMAT).date().isoformat()
    except ValueError:
        pass
    try:  # already ISO (or ISO-prefixed) — leave as-is
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        log.warning("unrecognised date %r; emitting blank", text)
        return ""


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--dataset-root",
        type=Path,
        required=True,
        help="Path to a cse-dataset checkout (the repo root).",
    )
    parser.add_argument("--out", type=Path, required=True, help="Bundle output directory.")
    parser.add_argument("--from", dest="date_from", help="Earliest trade date (inclusive).")
    parser.add_argument("--to", dest="date_to", help="Latest trade date (inclusive).")
    return parser.parse_args(argv)


def iter_accepted_files(accepted_root: Path, start: date | None, end: date | None):
    """Yield (trade_date, csv_path) for accepted dates inside the window, ascending."""
    for date_dir in sorted(accepted_root.iterdir()):
        if not date_dir.is_dir():
            continue
        try:
            day = date.fromisoformat(date_dir.name)
        except ValueError:
            log.warning("skipping non-date directory %s", date_dir.name)
            continue
        if (start and day < start) or (end and day > end):
            continue
        # One source subdirectory per accepted date; take every canonical file
        # so a date repaired from a second source is still picked up.
        for source_dir in sorted(date_dir.iterdir()):
            candidate = source_dir / "canonical_ohlcv.csv"
            if candidate.exists():
                yield day, candidate


def copy_metadata(src: Path, dest: Path) -> None:
    """Copy company metadata into the bundle, normalising date columns to ISO."""
    with src.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)

    for row in rows:
        for column in METADATA_DATE_COLUMNS:
            if column in row:
                row[column] = normalise_metadata_date(row[column])

    with dest.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def build_bundle(dataset_root: Path, out: Path, start: date | None, end: date | None) -> dict:
    accepted_root = dataset_root / ACCEPTED_SUBPATH
    metadata_src = dataset_root / METADATA_SUBPATH
    if not accepted_root.is_dir():
        raise SystemExit(
            f"no accepted OHLCV at {accepted_root} — run cse-dataset's backfill_ohlcv.py first"
        )
    if not metadata_src.exists():
        raise SystemExit(
            f"no company metadata at {metadata_src} — "
            "run cse-dataset's 01_collect_metadata.py first"
        )

    out.mkdir(parents=True, exist_ok=True)
    copy_metadata(metadata_src, out / "company_metadata.csv")

    prices_out = out / "daily_ohlcv.csv"
    header: list[str] | None = None
    dates = 0
    rows = 0
    symbols: set[str] = set()

    with prices_out.open("w", newline="", encoding="utf-8") as fh:
        writer: csv.DictWriter | None = None
        for day, path in iter_accepted_files(accepted_root, start, end):
            dates += 1
            with path.open(newline="", encoding="utf-8") as src:
                reader = csv.DictReader(src)
                if reader.fieldnames is None:
                    log.warning("empty accepted file %s", path)
                    continue
                if header is None:
                    header = list(reader.fieldnames)
                    writer = csv.DictWriter(fh, fieldnames=header)
                    writer.writeheader()
                elif list(reader.fieldnames) != header:
                    # Tolerate column drift between sources rather than failing the
                    # whole bundle: unknown columns are dropped, missing ones blank.
                    log.warning("column drift in %s; aligning to first-seen header", path)
                assert writer is not None
                for row in reader:
                    symbols.add(row.get("symbol", ""))
                    writer.writerow({key: row.get(key, "") for key in header})
                    rows += 1

    if header is None:
        raise SystemExit("no accepted OHLCV rows matched the requested window")

    return {"dates": dates, "rows": rows, "symbols": len(symbols)}


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args(argv)
    stats = build_bundle(
        args.dataset_root.expanduser(),
        args.out.expanduser(),
        parse_date(args.date_from),
        parse_date(args.date_to),
    )
    log.info(
        "bundle written to %s: %s rows across %s dates, %s symbols",
        args.out,
        f"{stats['rows']:,}",
        f"{stats['dates']:,}",
        stats["symbols"],
    )
    log.info("seed with: CSE_SEED_DATA_DIR=%s docker compose up market-data-seed", args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
