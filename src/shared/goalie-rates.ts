const formatOptionalGoalieRate = (
  value: number | null,
  decimals: number,
  games: number,
): string | undefined =>
  value != null && (value !== 0 || games > 0)
    ? value.toFixed(decimals)
    : undefined;

export const formatOptionalGoalieGaa = (
  value: number | null,
  games: number,
): string | undefined => formatOptionalGoalieRate(value, 2, games);

export const formatOptionalGoalieSavePercent = (
  value: number | null,
  games: number,
): string | undefined => formatOptionalGoalieRate(value, 3, games);
