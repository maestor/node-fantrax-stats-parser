#!/bin/bash
set -euo pipefail

YEAR=${1:-$(date +%Y)}

echo "🏒 Updating season ${YEAR}-$((YEAR + 1))..."
echo ""

# Run Playwright import
echo "📥 Running Playwright import..."
npm run playwright:import:regular -- --year="$YEAR"

echo ""
echo "🔄 Processing and uploading CSV files..."
./scripts/import-temp-csv.sh

echo ""
echo "✅ Season ${YEAR}-$((YEAR + 1)) updated and live!"
