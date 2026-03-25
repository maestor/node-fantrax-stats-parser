import type { RouteHandler } from "../../shared/router.js";
import {
  getCareerGoaliesData,
  getCareerHighlightsData,
  getCareerPlayersData,
  getGoalieCareerData,
  getPlayerCareerData,
} from "./service.js";
import {
  CAREER_HIGHLIGHT_CONFIG,
  CAREER_HIGHLIGHT_TYPES,
  DEFAULT_CAREER_HIGHLIGHT_SKIP,
  DEFAULT_CAREER_HIGHLIGHT_TAKE,
  MAX_CAREER_HIGHLIGHT_TAKE,
} from "../../config/index.js";
import { ERROR_MESSAGES, HTTP_STATUS } from "../../shared/http.js";
import {
  getCareerGoaliesSnapshotKey,
  getCareerHighlightsSnapshotKey,
  getCareerPlayersSnapshotKey,
} from "../../infra/snapshots/store.js";
import {
  getQueryParam,
  loadSnapshotOrFallback,
  sendNoStore,
  withErrorHandlingCached,
} from "../../shared/route-utils.js";
import type { CareerHighlightType } from "./types.js";

const isCareerHighlightType = (
  value: string,
): value is CareerHighlightType =>
  CAREER_HIGHLIGHT_TYPES.includes(value as CareerHighlightType);

const parsePagingParam = (
  value: string | undefined,
): number | null | undefined => {
  if (value === undefined) return undefined;
  if (!/^\d+$/u.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const getCareerPlayer: RouteHandler<{ id: string }> = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: await getPlayerCareerData(req.params.id),
    dataSource: "db",
  }));
};

export const getCareerGoalie: RouteHandler<{ id: string }> = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: await getGoalieCareerData(req.params.id),
    dataSource: "db",
  }));
};

export const getCareerPlayers: RouteHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getCareerPlayersSnapshotKey(), () =>
      getCareerPlayersData(),
    ),
  );
};

export const getCareerGoalies: RouteHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, () =>
    loadSnapshotOrFallback(getCareerGoaliesSnapshotKey(), () =>
      getCareerGoaliesData(),
    ),
  );
};

export const getCareerHighlights: RouteHandler<{ type: string }> = async (
  req,
  res,
) => {
  const rawType = req.params.type;
  if (!isCareerHighlightType(rawType)) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_CAREER_HIGHLIGHT_TYPE,
    );
    return;
  }

  const skip = parsePagingParam(getQueryParam(req, "skip"));
  const take = parsePagingParam(getQueryParam(req, "take"));
  if (
    skip === null ||
    take === null ||
    (skip !== undefined && skip < 0) ||
    (take !== undefined && (take < 0 || take > MAX_CAREER_HIGHLIGHT_TAKE))
  ) {
    sendNoStore(
      res,
      HTTP_STATUS.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_PAGING_PARAMS,
    );
    return;
  }

  const resolvedSkip = skip ?? DEFAULT_CAREER_HIGHLIGHT_SKIP;
  const resolvedTake = take ?? DEFAULT_CAREER_HIGHLIGHT_TAKE;

  await withErrorHandlingCached(req, res, async () => {
    const result = await loadSnapshotOrFallback(
      getCareerHighlightsSnapshotKey(rawType),
      () => getCareerHighlightsData(rawType),
    );
    const items = result.data.slice(resolvedSkip, resolvedSkip + resolvedTake);

    return {
      data: {
        type: rawType,
        minAllowed: CAREER_HIGHLIGHT_CONFIG[rawType].minCount,
        skip: resolvedSkip,
        take: resolvedTake,
        total: result.data.length,
        items,
      },
      dataSource: result.dataSource,
    };
  });
};
