import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretRotationV2Raw } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";

import { salesforceOauthCredentialsRotationFactory } from "./salesforce-oauth-credentials-rotation-fns";
import { TSalesforceOauthCredentialsRotationWithConnection } from "./salesforce-oauth-credentials-rotation-types";

const salesforce = vi.hoisted(() => ({
  requested: [] as string[],
  links: { consumer: "", staged: "" }
}));

vi.mock("@app/lib/validator", () => ({ blockLocalAndPrivateIpAddresses: vi.fn() }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@app/lib/config/request", () => ({
  request: {
    request: async ({ method, url }: { method: string; url: string }) => {
      salesforce.requested.push(`${method} ${url}`);
      if (url.endsWith("/services/oauth2/token")) return { data: { token_type: "Bearer", access_token: "token" } };
      if (method === "GET") {
        return { data: { consumers: [{ key: "app-key", stagedCredentialsUrl: salesforce.links.consumer }] } };
      }
      if (method === "POST") {
        return {
          data: { stagedCredentials: [{ url: salesforce.links.staged, key: "new-key", secret: "new-secret" }] }
        };
      }
      return { data: {} };
    }
  }
}));

const INSTANCE_URL = "https://acme.my.salesforce.com";
const CONSUMER_LINK = "/services/data/v65.0/apps/oauth/credentials/app-id/consumer-id/staged";
const STAGED_LINK = `${CONSUMER_LINK}/staged-id`;
const OUTSIDE_INSTANCE_MESSAGE = "Salesforce returned a link outside the connection's instance URL.";
const TOKEN_REQUEST = `POST ${INSTANCE_URL}/services/oauth2/token`;

const COMMITTED = "committed" as unknown as TSecretRotationV2Raw;

// The factory reads the connection credentials, parameters and secrets mapping and nothing else.
const rotation = {
  connection: { credentials: { instanceUrl: INSTANCE_URL, consumerKey: "connection-key", consumerSecret: "secret" } },
  parameters: { appId: "app-id", appName: "App" },
  secretsMapping: { consumerKey: "CONSUMER_KEY", consumerSecret: "CONSUMER_SECRET" }
} as unknown as TSalesforceOauthCredentialsRotationWithConnection;

const makeFactory = () =>
  salesforceOauthCredentialsRotationFactory(
    rotation,
    ...([{}, {}, {}, {}, {}] as unknown as [
      Parameters<typeof salesforceOauthCredentialsRotationFactory>[1],
      Parameters<typeof salesforceOauthCredentialsRotationFactory>[2],
      Parameters<typeof salesforceOauthCredentialsRotationFactory>[3],
      Parameters<typeof salesforceOauthCredentialsRotationFactory>[4],
      Parameters<typeof salesforceOauthCredentialsRotationFactory>[5]
    ])
  );

const requestedHosts = () => [...new Set(salesforce.requested.map((entry) => new URL(entry.split(" ")[1]).host))];

describe("Salesforce OAuth credentials rotation links", () => {
  beforeEach(() => {
    salesforce.requested = [];
    salesforce.links = { consumer: CONSUMER_LINK, staged: STAGED_LINK };
  });

  it("issues a new consumer secret through links on the instance", async () => {
    const callback = vi.fn().mockResolvedValue(COMMITTED);

    await makeFactory().issueCredentials(callback);

    expect(callback).toHaveBeenCalledWith({
      consumerKey: "new-key",
      consumerSecret: "new-secret",
      stagedCredentialUrl: STAGED_LINK
    });
    expect(salesforce.requested).toEqual([
      TOKEN_REQUEST,
      `GET ${INSTANCE_URL}/services/data/v65.0/apps/oauth/credentials/app-id`,
      `POST ${INSTANCE_URL}${CONSUMER_LINK}`,
      `PATCH ${INSTANCE_URL}${STAGED_LINK}`
    ]);
  });

  it.each([
    ["the consumer's staged credentials link", "consumer"],
    ["the staged credential link", "staged"]
  ] as const)("refuses to issue a secret when %s is outside the instance", async (_, link) => {
    salesforce.links[link] = `@internal.example${STAGED_LINK}`;
    const callback = vi.fn();

    await expect(makeFactory().issueCredentials(callback)).rejects.toThrow(OUTSIDE_INSTANCE_MESSAGE);
    expect(requestedHosts()).toEqual(["acme.my.salesforce.com"]);
    expect(callback).not.toHaveBeenCalled();
  });

  it("refuses a rotation whose stored link is outside the instance before issuing a new secret", async () => {
    const callback = vi.fn();
    const previous = {
      consumerKey: "old-key",
      consumerSecret: "old-secret",
      stagedCredentialUrl: `@internal.example${STAGED_LINK}`
    };

    await expect(makeFactory().rotateCredentials(previous, callback, previous)).rejects.toThrow(
      OUTSIDE_INSTANCE_MESSAGE
    );
    expect(salesforce.requested).toEqual([TOKEN_REQUEST]);
    expect(callback).not.toHaveBeenCalled();
  });
});
