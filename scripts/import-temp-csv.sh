#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIR="${ROOT_DIR}/csv/temp"
HANDLER_SCRIPT="${ROOT_DIR}/scripts/handle-csv.sh"

DRY_RUN=false
SEASON_START_YEAR="${IMPORT_SEASON_START_YEAR:-}"
REPORT_TYPE_FILTER="${IMPORT_REPORT_TYPE:-}"

usage() {
  cat <<'USAGE'
Usage: ./scripts/import-temp-csv.sh [--dry-run|-n] [--season=YYYY] [--report-type=regular|playoffs]

Scans csv/temp/*.csv for files matching:
  {teamName}-{teamId}-{regular|playoffs}-YYYY-YYYY.csv

Then cleans each CSV using scripts/handle-csv.sh and writes it to:
  csv/<teamId>/{regular|playoffs}-YYYY-YYYY.csv

Options:
  --dry-run, -n   Print what would be imported, but do not write files
  --season=YYYY   Import only files for this season start year (also
                  used for R2 upload/DB import filtering)
  --report-type=regular|playoffs
                  Import only one report type (also used for R2 upload/DB import filtering)
  --help, -h      Show this help
USAGE
}

while (( "$#" )); do
  case "$1" in
    --dry-run|-n)
      DRY_RUN=true
      shift
      ;;
    --season=*)
      SEASON_START_YEAR="${1#*=}"
      shift
      ;;
    --report-type=*)
      REPORT_TYPE_FILTER="${1#*=}"
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

if [[ -n "$SEASON_START_YEAR" ]] && [[ ! "$SEASON_START_YEAR" =~ ^[0-9]{4}$ ]]; then
  echo "Invalid --season value: $SEASON_START_YEAR (expected YYYY)" >&2
  exit 2
fi
if [[ -n "$REPORT_TYPE_FILTER" ]] && [[ ! "$REPORT_TYPE_FILTER" =~ ^(regular|playoffs)$ ]]; then
  echo "Invalid --report-type value: $REPORT_TYPE_FILTER (expected regular or playoffs)" >&2
  exit 2
fi

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
imported_source_files=()

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

    if [[ -n "$SEASON_START_YEAR" ]] && [[ "$start_year" != "$SEASON_START_YEAR" ]]; then
      echo "Skip: $filename (season filter: expected ${SEASON_START_YEAR})"
      skipped=$((skipped + 1))
      continue
    fi
    if [[ -n "$REPORT_TYPE_FILTER" ]] && [[ "$report_type" != "$REPORT_TYPE_FILTER" ]]; then
      echo "Skip: $filename (report-type filter: expected ${REPORT_TYPE_FILTER})"
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
      imported_source_files+=("$filepath")
    fi
  else
    skipped=$((skipped + 1))
    echo "Skip: $filename (does not match {teamName}-{teamId}-{regular/playoffs}-YYYY-YYYY.csv)" >&2
  fi
done

# Upload to R2 and import to database if files were imported
if [[ "$IMPORTED_COUNT" -gt 0 ]]; then
  mode_args=()
  report_type_args=()
  if [[ -n "$SEASON_START_YEAR" ]]; then
    mode_args=(--season="${SEASON_START_YEAR}")
  else
    mode_args=(--current-only)
  fi
  if [[ -n "$REPORT_TYPE_FILTER" ]]; then
    report_type_args=(--report-type="${REPORT_TYPE_FILTER}")
  fi

  # Upload to R2 if enabled (CSV backup/download store)
  if [[ "${USE_R2_STORAGE:-false}" == "true" ]]; then
    echo ""
    echo "📤 Uploading to R2..."
    if ! npm run r2:upload -- "${mode_args[@]}" "${report_type_args[@]}"; then
      echo "⚠️  R2 upload failed" >&2
    fi
  fi

  # Import to database (USE_REMOTE_DB controls local vs remote)
  echo ""
  echo "📥 Importing to database..."
  if npm run db:import:stats -- "${mode_args[@]}" "${report_type_args[@]}"; then
    echo ""
    echo "🧹 Cleaning up temp files..."
    removed=0
    for imported_path in "${imported_source_files[@]}"; do
      if [[ -f "$imported_path" ]]; then
        rm -f "$imported_path"
        removed=$((removed + 1))
      fi
    done
    echo "Removed ${removed} imported file(s) from csv/temp/"
  else
    echo "⚠️  Database import failed, keeping temp files" >&2
  fi
fi

echo "Done. Matched: $matched, Skipped: $skipped, Imported: $IMPORTED_COUNT"
