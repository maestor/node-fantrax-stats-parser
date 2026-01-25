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
  function strip_quotes(s) {
    gsub(/^"+|"+$/, "", s)
    return s
  }

  BEGIN {OFS=","; section=""; age_col=0}
  /^"","Skaters"/ {print "\"Skaters\""; section="skaters"; age_col=0; delete skip; next}
  /^"","Goalies"/ {print "\"Goalies\""; section="goalies"; age_col=0; delete skip; next}
  /^""$/ {print ""; next}
  {
    # Remove first column
    n=0
    for (i=2; i<=NF; i++) {
      n++; col[n]=$i
    }

    # On header row, detect columns to skip (Age + Fantrax draft info)
    if (strip_quotes(col[1])=="Pos") {
      age_col=0
      delete skip

      for (i=1; i<=n; i++) {
        header = strip_quotes(col[i])
        if (header=="Age") {
          age_col=i
        }
        if (header=="% of leagues in which player was drafted") {
          skip[i]=1
        }
        if (header=="Average draft position among all leagues on Fantrax") {
          skip[i]=1
        }
      }
    }

    # Build output array, skipping Age column and any detected draft columns
    out_n=0
    for (i=1; i<=n; i++) {
      if (i != age_col && !(i in skip)) {
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