#!/bin/bash
# filepath: /Users/maestor/Documents/projects/node-fantrax-stats-parser/scripts/handle-csv.sh

# Usage: ./handle-csv.sh input.csv [output.csv]

INPUT="$1"
OUTPUT="$2"

if [[ -z "$INPUT" ]]; then
  echo "Usage: $0 input.csv [output.csv]"
  exit 1
fi

awk -F',' '
  BEGIN {OFS=","; section=""; age_col=0}
  /^"","Skaters"/ {print "\"Skaters\""; section="skaters"; age_col=0; next}
  /^"","Goalies"/ {print "\"Goalies\""; section="goalies"; age_col=0; next}
  /^""$/ {print ""; next}
  {
    # Remove first column
    n=0
    for (i=2; i<=NF; i++) {
      n++; col[n]=$i
    }
    # On header row, find Age column index
    if (col[1]=="\"Pos\"") {
      age_col=0
      for (i=1; i<=n; i++) {
        if (col[i]=="\"Age\"") age_col=i
      }
    }
    # Build output array, skipping Age column if set
    out_n=0
    for (i=1; i<=n; i++) {
      if (i != age_col) {
        out_n++; out[out_n]=col[i]
      }
    }
    # Print joined output columns
    if (out_n > 0) {
      for (i=1; i<=out_n; i++) {
        printf "%s", out[i]
        if (i < out_n) printf OFS
      }
      printf ORS
    }
    delete out
  }
' "$INPUT" > "${OUTPUT:-/dev/stdout}"

if [[ -n "$OUTPUT" ]]; then
  echo "Cleaned CSV written to $OUTPUT"
fi