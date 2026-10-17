export const selectImportSeasons = <T extends { year: number }>(
  seasons: T[],
  args: string[],
): T[] => {
  const argument = args.find((arg) => arg.startsWith("--season="));
  if (!argument) return seasons;
  const value = argument.slice("--season=".length);
  if (!/^\d{4}$/.test(value))
    throw new Error("Invalid --season; expected YYYY.");
  const selected = seasons.filter((season) => season.year === Number(value));
  if (selected.length !== 1)
    throw new Error(`Expected one mapped season for --season=${value}.`);
  return selected;
};
