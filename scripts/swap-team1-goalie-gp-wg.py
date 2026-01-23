#!/usr/bin/env python3

"""Swap goalie columns GP <-> W-G in team 1 CSVs for seasons 2014-2024.

Fantrax has started exporting older seasons with the newer goalie layout.
This script updates only team 1 files so the parser can assume a single
layout (GP first, then W-G).

It swaps the *entire columns* (header + all goalie rows, including Totals)
inside the "Goalies" section.
"""

from __future__ import annotations

import csv
import os
import re
from pathlib import Path
from typing import List, Optional, Tuple


ROOT = Path(__file__).resolve().parents[1]
TEAM_ID = "1"
SEASON_MIN = 2012
SEASON_MAX = 2024
REPORTS = ("regular", "playoffs")


FILENAME_RE = re.compile(r"^(regular|playoffs)-(\d{4})-(\d{4})\.csv$")


def parse_season_from_filename(filename: str) -> Optional[Tuple[str, int]]:
    m = FILENAME_RE.match(filename)
    if not m:
        return None
    report = m.group(1)
    season = int(m.group(2))
    return report, season


def _parse_int_prefix(value: str) -> Optional[int]:
    if not value:
        return None
    m = re.match(r"^\s*(\d+)", value)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def swap_goalie_columns_in_rows(rows: List[List[str]]) -> Tuple[List[List[str]], bool]:
    """Normalize goalie section to GP then W-G.

    Idempotent by design:
    - If the header is W-G then GP, we swap the columns for all goalie rows.
    - If the header is already GP then W-G, we only swap individual rows when
      the numeric values are clearly inverted (wins > games).
    """

    out: List[List[str]] = []
    in_goalies = False
    swapped_any = False
    gp_idx: Optional[int] = None
    wg_idx: Optional[int] = None
    did_global_column_swap = False

    for row in rows:
        # Preserve blank lines and single-cell section markers
        if len(row) == 1 and row[0] == "Goalies":
            in_goalies = True
            gp_idx = None
            wg_idx = None
            out.append(row)
            continue

        if len(row) == 1 and row[0] == "Skaters":
            in_goalies = False
            gp_idx = None
            wg_idx = None
            out.append(row)
            continue

        if not in_goalies:
            out.append(row)
            continue

        # Identify goalie header
        if row and row[0] == "Pos" and "GP" in row and "W-G" in row:
            gp_idx = row.index("GP")
            wg_idx = row.index("W-G")

            # If header is reversed (W-G before GP), swap the columns for the
            # entire goalie section (header + all subsequent rows).
            if wg_idx < gp_idx:
                row = row[:]  # copy
                row[gp_idx], row[wg_idx] = row[wg_idx], row[gp_idx]
                swapped_any = True
                did_global_column_swap = True

                # After swapping names, the intended GP column is now at wg_idx
                # and intended W-G column is now at gp_idx.
                gp_idx, wg_idx = wg_idx, gp_idx

            out.append(row)
            continue

        # Normalize rows when indices known
        if gp_idx is not None and wg_idx is not None and row and max(gp_idx, wg_idx) < len(row):
            if did_global_column_swap:
                # We already swapped the header names; now swap the values for
                # every subsequent row to match the new column order.
                row = row[:]  # copy
                row[gp_idx], row[wg_idx] = row[wg_idx], row[gp_idx]
                swapped_any = True
            else:
                # Header already GP then W-G. Only swap if the values appear
                # inverted (wins cannot exceed games).
                gp_val = _parse_int_prefix(row[gp_idx])
                wg_val = _parse_int_prefix(row[wg_idx])
                if gp_val is not None and wg_val is not None and wg_val > gp_val:
                    row = row[:]  # copy
                    row[gp_idx], row[wg_idx] = row[wg_idx], row[gp_idx]
                    swapped_any = True

        out.append(row)

    return out, swapped_any


def read_csv_rows(path: Path) -> List[List[str]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f, delimiter=",", quotechar='"')
        return [row for row in reader]


def write_csv_rows(path: Path, rows: List[List[str]]) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(
            f,
            delimiter=",",
            quotechar='"',
            quoting=csv.QUOTE_ALL,
            lineterminator="\n",
            doublequote=True,
        )
        for row in rows:
            writer.writerow(row)

    os.replace(tmp_path, path)


def main() -> int:
    team_dir = ROOT / "csv" / TEAM_ID
    if not team_dir.exists():
        raise SystemExit(f"Missing folder: {team_dir}")

    changed = 0
    checked = 0

    for path in sorted(team_dir.glob("*.csv")):
        parsed = parse_season_from_filename(path.name)
        if not parsed:
            continue
        report, season = parsed
        if report not in REPORTS:
            continue
        if not (SEASON_MIN <= season <= SEASON_MAX):
            continue

        checked += 1
        rows = read_csv_rows(path)
        updated, swapped = swap_goalie_columns_in_rows(rows)
        if swapped:
            write_csv_rows(path, updated)
            changed += 1

    print(f"Checked {checked} files; updated {changed}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
