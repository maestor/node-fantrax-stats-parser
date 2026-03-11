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
    # Remove the first column only when it is an empty placeholder.
    # Fantrax exports use an empty first cell for section marker rows, but
    # actual data rows can have "ID" in first column and must be preserved.
    start_col=1
    if (strip_quotes($1)=="") {
      start_col=2
    }

    n=0
    for (i=start_col; i<=NF; i++) {
      n++; col[n]=$i
    }

    # On header row, detect columns to skip (Age + Fantrax draft info).
    # Header can be either:
    # - Pos,Player,...            (already-normalized files)
    # - ID,Pos,Player,...         (raw/ID-preserving files)
    is_header=0
    for (i=1; i<=n; i++) {
      if (strip_quotes(col[i])=="Pos") {
        is_header=1
        break
      }
    }

    if (is_header==1) {
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

    if (section=="goalies" && out_n >= 2 && strip_quotes(out[1])=="*06mqq*" && strip_quotes(out[2])!="G") {
      out[2]="\"G\""
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
