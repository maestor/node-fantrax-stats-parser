import type { RouteHandler } from "../../shared/router.js";
import { withErrorHandlingCached } from "../../shared/route-utils.js";
import { getEntryDraftData, getOriginalDraftData } from "./service.js";

export const getEntryDraft: RouteHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: await getEntryDraftData(),
    dataSource: "db",
  }));
};

export const getOriginalDraft: RouteHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: await getOriginalDraftData(),
    dataSource: "db",
  }));
};
