import type { RouteHandler } from "../../shared/router.js";
import { withErrorHandlingCached } from "../../shared/route-utils.js";
import { getOriginalDraftData } from "./service.js";

export const getOriginalDraft: RouteHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: await getOriginalDraftData(),
    dataSource: "db",
  }));
};
