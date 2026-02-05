import { getR2Client } from "./r2-client";

export interface SeasonManifest {
  [teamId: string]: {
    regular: number[];
    playoffs: number[];
  };
}

let manifestCache: SeasonManifest | null = null;

export const getSeasonManifest = async (): Promise<SeasonManifest> => {
  if (manifestCache) return manifestCache;

  try {
    const r2 = getR2Client();
    const manifestJson = await r2.getObject("manifest.json");
    manifestCache = JSON.parse(manifestJson);
    return manifestCache!;
  } catch {
    // Fallback: empty manifest
    return {};
  }
};

export const resetManifestCache = (): void => {
  manifestCache = null;
};
