import { beforeEach, describe, expect, test, vi } from "vitest";

import { listSalesforceConnectionOauthApps } from "./salesforce-connection-fns";
import { TSalesforceConnection } from "./salesforce-connection-types";

const salesforce = vi.hoisted(() => ({
  requested: [] as string[],
  pages: {} as Record<string, { apps: { identifier: string; developerName: string }[]; nextPageUrl: string | null }>
}));

vi.mock("@app/lib/validator", () => ({ blockLocalAndPrivateIpAddresses: vi.fn() }));
vi.mock("@app/lib/config/request", () => ({
  request: {
    request: async ({ url }: { url: string }) => {
      salesforce.requested.push(url);
      if (url.endsWith("/services/oauth2/token")) return { data: { token_type: "Bearer", access_token: "token" } };
      return { data: salesforce.pages[url] };
    }
  }
}));

const INSTANCE_URL = "https://acme.my.salesforce.com";
const FIRST_PAGE = "/services/data/v65.0/apps/oauth/usage";
const OUTSIDE_INSTANCE_MESSAGE = "Salesforce returned a link outside the connection's instance URL.";

const connection = {
  credentials: { instanceUrl: INSTANCE_URL, consumerKey: "key", consumerSecret: "secret" }
} as TSalesforceConnection;

const app = (identifier: string) => ({ identifier, developerName: identifier });

describe("listSalesforceConnectionOauthApps", () => {
  beforeEach(() => {
    salesforce.requested = [];
    salesforce.pages = {};
  });

  test("follows the next page link on the instance", async () => {
    salesforce.pages[`${INSTANCE_URL}${FIRST_PAGE}`] = { apps: [app("first")], nextPageUrl: `${FIRST_PAGE}?page=2` };
    salesforce.pages[`${INSTANCE_URL}${FIRST_PAGE}?page=2`] = { apps: [app("second")], nextPageUrl: null };

    const apps = await listSalesforceConnectionOauthApps(connection);

    expect(apps.map(({ identifier }) => identifier)).toEqual(["first", "second"]);
  });

  test("refuses a next page link outside the instance without requesting it", async () => {
    salesforce.pages[`${INSTANCE_URL}${FIRST_PAGE}`] = {
      apps: [app("first")],
      nextPageUrl: `@internal.example${FIRST_PAGE}?page=2`
    };

    await expect(listSalesforceConnectionOauthApps(connection)).rejects.toThrow(OUTSIDE_INSTANCE_MESSAGE);
    expect(salesforce.requested.map((url) => new URL(url).host)).toEqual([
      "acme.my.salesforce.com",
      "acme.my.salesforce.com"
    ]);
  });
});
