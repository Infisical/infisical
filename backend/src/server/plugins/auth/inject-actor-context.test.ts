import { describe, expect, test, vi } from "vitest";

import { ActorType, AuthMethod, AuthMode } from "@app/lib/auth/actor-types";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

import { principalFromAuth } from "./inject-actor-context";
import { TAuthMode } from "./inject-identity";

const context = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@fastify/request-context", () => ({
  requestContext: { get: (key: string) => context.get(key) }
}));

const userAuth = (authMode: AuthMode, oauthClientId?: string) =>
  ({
    actorType: ActorType.USER,
    authMode,
    userId: "user-1",
    authMethod: AuthMethod.EMAIL,
    isMfaVerified: true,
    oauthClientId,
    user: { username: "ada", email: "ada@example.com", superAdmin: true }
  }) as unknown as TAuthMode;

describe("principalFromAuth", () => {
  test("should carry a narrowed OAuth token's scopes, even an empty list, so instance-admin reach is refused", () => {
    // Setup
    context.clear();
    context.set(RequestContextKey.OauthScopes, []);

    // Action
    const { principal } = principalFromAuth(userAuth(AuthMode.OAUTH, "oauth_client_e2e"));

    // Assert
    expect(principal).toMatchObject({ isSuperAdmin: true, oauth: { clientId: "oauth_client_e2e", scopes: [] } });
  });

  test("should leave a fully delegated OAuth token's scopes unset, so it keeps the user's whole reach", () => {
    // Setup
    context.clear();

    // Action
    const { principal } = principalFromAuth(userAuth(AuthMode.OAUTH, "oauth_client_e2e"));

    // Assert
    expect(principal).toMatchObject({ oauth: { clientId: "oauth_client_e2e", scopes: undefined } });
  });

  test("should give a first-party session no OAuth delegation at all", () => {
    // Setup
    context.clear();
    context.set(RequestContextKey.OauthScopes, ["secrets:read"]);

    // Action
    const { principal } = principalFromAuth(userAuth(AuthMode.JWT));

    // Assert
    expect(principal).toMatchObject({ type: ActorType.USER, oauth: undefined });
  });
});
