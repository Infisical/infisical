import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretRotationV2Raw } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";

import { auth0ClientSecretRotationFactory } from "./auth0-client-secret-rotation-fns";
import { TAuth0ClientSecretRotationWithConnection } from "./auth0-client-secret-rotation-types";

const requests = vi.hoisted(() => [] as string[]);

vi.mock("@app/lib/validator", () => ({
  blockLocalAndPrivateIpAddresses: async () => {},
  safeRequest: {
    request: async ({ method, url }: { method: string; url: string }) => {
      requests.push(`${method} ${url}`);
      return { data: {} };
    }
  }
}));
vi.mock("@app/services/app-connection/auth0/auth0-connection-fns", () => ({
  getAuth0ConnectionAccessToken: async () => "access-token"
}));

const AUDIENCE = "https://tenant.auth0.com/api/v2/";
const COMMITTED = "committed" as unknown as TSecretRotationV2Raw;

const makeFactory = (clientId: string) =>
  auth0ClientSecretRotationFactory(
    {
      connection: { credentials: { clientId: "connection-client", audience: AUDIENCE } },
      parameters: { clientId }
    } as unknown as TAuth0ClientSecretRotationWithConnection,
    ...([{}, {}, {}, {}, {}] as unknown as [
      Parameters<typeof auth0ClientSecretRotationFactory>[1],
      Parameters<typeof auth0ClientSecretRotationFactory>[2],
      Parameters<typeof auth0ClientSecretRotationFactory>[3],
      Parameters<typeof auth0ClientSecretRotationFactory>[4],
      Parameters<typeof auth0ClientSecretRotationFactory>[5]
    ])
  );

describe("Auth0 client secret rotation", () => {
  beforeEach(() => {
    requests.length = 0;
  });

  it("refuses to rotate the connection's own application", () => {
    expect(() => makeFactory("connection-client")).toThrow(
      "Cannot rotate the client secret of the application that this Auth0 connection authenticates with. Choose a different application or use a separate Auth0 connection."
    );
  });

  it("encodes the client ID in request paths", async () => {
    const factory = makeFactory("client/id#1");

    await factory.issueCredentials(vi.fn().mockResolvedValue(COMMITTED));
    await factory.revokeCredentials([], vi.fn());

    expect(requests).toEqual([
      `PATCH ${AUDIENCE}clients/client%2Fid%231`,
      `POST ${AUDIENCE}clients/client%2Fid%231/rotate-secret`
    ]);
  });
});
