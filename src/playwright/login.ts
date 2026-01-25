import { chromium } from "playwright";
import { existsSync } from "fs";

import { AUTH_STATE_PATH, saveAuthStateInteractive } from "./helpers";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false });

  try {
    const context = await browser.newContext({
      storageState: existsSync(AUTH_STATE_PATH) ? AUTH_STATE_PATH : undefined,
    });
    const page = await context.newPage();

    await saveAuthStateInteractive(context, page);
  } finally {
    await browser.close();
  }
}

void main();
