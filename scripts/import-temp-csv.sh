#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIR="${ROOT_DIR}/csv/temp"
HANDLER_SCRIPT="${ROOT_DIR}/scripts/handle-csv.sh"

DRY_RUN=false

usage() {
  cat <<'USAGE'
Usage: ./scripts/import-temp-csv.sh [--dry-run|-n]

Scans csv/temp/*.csv for files matching:
  {teamName}-{teamId}-{regular|playoffs}-YYYY-YYYY.csv

Then cleans each CSV using scripts/handle-csv.sh and writes it to:
  csv/<teamId>/{regular|playoffs}-YYYY-YYYY.csv

Options:
  --dry-run, -n   Print what would be imported, but do not write files
  --help, -h      Show this help
USAGE
}

while (( "$#" )); do
  case "$1" in
    --dry-run|-n)
      DRY_RUN=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "$TEMP_DIR" ]]; then
  echo "Temp directory not found: $TEMP_DIR" >&2
  exit 1
fi

if [[ ! -f "$HANDLER_SCRIPT" ]]; then
  echo "CSV handler script not found: $HANDLER_SCRIPT" >&2
  exit 1
fi

shopt -s nullglob
csv_files=("$TEMP_DIR"/*.csv)

if (( ${#csv_files[@]} == 0 )); then
  echo "No .csv files found in $TEMP_DIR"
  exit 0
fi

matched=0
skipped=0
IMPORTED_COUNT=0

for filepath in "${csv_files[@]}"; do
  filename="$(basename "$filepath")"

  # Expected: {teamName}-{teamId}-{regular/playoffs}-YYYY-YYYY.csv
  # teamName may include hyphens; teamId must be numeric.
  if [[ "$filename" =~ ^(.+)-([0-9]+)-(regular|playoffs)-([0-9]{4})-([0-9]{4})\.csv$ ]]; then
    matched=$((matched + 1))

    team_name="${BASH_REMATCH[1]}"
    team_id="${BASH_REMATCH[2]}"
    report_type="${BASH_REMATCH[3]}"
    start_year="${BASH_REMATCH[4]}"
    end_year="${BASH_REMATCH[5]}"

    expected_end_year=$((10#${start_year} + 1))
    if [[ "$end_year" != "$expected_end_year" ]]; then
      echo "Skip: $filename (invalid season boundary: $start_year-$end_year)" >&2
      skipped=$((skipped + 1))
      continue
    fi

    dest_dir="${ROOT_DIR}/csv/${team_id}"

    # API expects: csv/<teamId>/{regular|playoffs}-YYYY-YYYY.csv
    dest_file="${dest_dir}/${report_type}-${start_year}-${end_year}.csv"

    if [[ "$DRY_RUN" == "true" ]]; then
      echo "Would import: $filename -> csv/${team_id}/$(basename "$dest_file") (teamName=${team_name})"
    else
      mkdir -p "$dest_dir"
      bash "$HANDLER_SCRIPT" "$filepath" "$dest_file" >/dev/null
      echo "Imported: $filename -> csv/${team_id}/$(basename "$dest_file") (teamName=${team_name})"
      IMPORTED_COUNT=$((IMPORTED_COUNT + 1))
    fi
  else
    skipped=$((skipped + 1))
    echo "Skip: $filename (does not match {teamName}-{teamId}-{regular/playoffs}-YYYY-YYYY.csv)" >&2
  fi
done

# Upload to R2 and import to database if files were imported
if [[ "$IMPORTED_COUNT" -gt 0 ]]; then
  # Upload to R2 if enabled (CSV backup/download store)
  if [[ "${USE_R2_STORAGE:-false}" == "true" ]]; then
    echo ""
    echo "📤 Uploading to R2..."
    if ! npm run r2:upload:current; then
      echo "⚠️  R2 upload failed" >&2
    fi
  fi

  # Import to local database (always — local.db is the working copy)
  echo ""
  echo "📥 Importing to local database..."
  if npm run db:import:local:current; then
    echo ""
    echo "🧹 Cleaning up temp files..."
    rm -f "$TEMP_DIR"/*.csv
    echo "Removed CSV files from csv/temp/"
  else
    echo "⚠️  Database import failed, keeping temp files" >&2
  fi
fi

echo "Done. Matched: $matched, Skipped: $skipped, Imported: $IMPORTED_COUNT"
