import type { RouteHandler } from "../../shared/router.js";
import { withErrorHandlingCached } from "../../shared/route-utils.js";
import { getCareerHistoryData, getTradeDetailData } from "./service.js";

export const getCareerHistory: RouteHandler<{ id: string }> = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: await getCareerHistoryData(req.params.id),
    dataSource: "db",
  }));
};

export const getTradeDetail: RouteHandler<{ id: string }> = async (
  req,
  res,
) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: await getTradeDetailData(req.params.id),
    dataSource: "db",
  }));
};
