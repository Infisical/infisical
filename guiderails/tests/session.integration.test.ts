import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadInstanceState, type InstanceState } from "../src/env/bootstrap.js";
import { setupFixture } from "../src/env/fixtures.js";
import { createBrowserSession } from "../src/env/session.js";

/**
 * Integration test: needs a running instance (`guiderails env up`). Skipped otherwise so the
 * unit suite stays offline and fast.
 *
 * This covers the single riskiest claim in the design: that a browser can be pre-authenticated
 * by injecting one httpOnly cookie, with no login UI driven and no client-side key material.
 */

let state: InstanceState | null = null;
try {
  state = loadInstanceState();
} catch {
  state = null;
}

const suite = state ? describe : describe.skip;

suite("browser pre-authentication", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  it("reaches an authenticated app page without driving the login UI", async () => {
    const instance = state as InstanceState;
    const fixture = await setupFixture("project-with-secrets", instance);

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await createBrowserSession(context, instance.baseUrl, {
      email: instance.adminEmail,
      password: instance.adminPassword,
      organizationId: instance.organizationId
    });

    const page = await context.newPage();
    await page.goto(`${instance.baseUrl}${fixture.entryPath}`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Never bounced to login, and never parked on the instance onboarding wizard.
    expect(page.url()).not.toMatch(/\/login|\/signup/);
    expect(page.url()).not.toMatch(/\/admin\/setup/);

    const snapshot = await page.locator("body").ariaSnapshot();
    expect(snapshot).toContain("Project Overview");
    // The observation primitive has to carry accessible names, or the agent has nothing
    // to address controls by.
    expect(snapshot).toContain('button "Add Secret"');

    await context.close();
  }, 120_000);

  it("seeds the fixture's secrets into the page the agent will see", async () => {
    const instance = state as InstanceState;
    const fixture = await setupFixture("project-with-secrets", instance);

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await createBrowserSession(context, instance.baseUrl, {
      email: instance.adminEmail,
      password: instance.adminPassword,
      organizationId: instance.organizationId
    });

    const page = await context.newPage();
    await page.goto(`${instance.baseUrl}${fixture.entryPath}`, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1000);

    const snapshot = await page.locator("body").ariaSnapshot();
    expect(snapshot).toContain("DATABASE_URL");

    await context.close();
  }, 120_000);
});
