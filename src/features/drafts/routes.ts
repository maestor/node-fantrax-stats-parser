import type { RouteHandler } from "../../shared/router.js";
import { withErrorHandlingCached } from "../../shared/route-utils.js";
import {
  getEntryDraftData,
  getExpansionDraftData,
  getOriginalDraftData,
} from "./service.js";

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

export const getExpansionDraft: RouteHandler = async (req, res) => {
  await withErrorHandlingCached(req, res, async () => ({
    data: await getExpansionDraftData(),
    dataSource: "db",
  }));
};
