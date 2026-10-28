import { describe, expect, test } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";

import { AgentVaultMemberType, AgentVaultSessionStatus } from "../agent-vault/agent-vault-enums";
import {
  deriveSessionStatus,
  describeSessionForAudit,
  isOrphanedSession,
  isSessionOwnedBy
} from "./agent-vault-session-fns";

const live = { expiresAt: null, revokedAt: null };

describe("agent vault session status", () => {
  test("a session whose owner was deleted reads as revoked", () => {
    expect(isOrphanedSession({ userId: null, identityId: null })).toBe(true);
    expect(deriveSessionStatus({ ...live, userId: null, identityId: null })).toBe(AgentVaultSessionStatus.Revoked);
  });

  // The name outlives the identity, which is how the row still says it was started on someone's behalf.
  test("an on-behalf-of session whose acting identity was deleted reads as revoked", () => {
    const session = { ...live, userId: "user-1", actingIdentityId: null, actingIdentityName: "slack-bot" };
    expect(isOrphanedSession(session)).toBe(true);
    expect(deriveSessionStatus(session)).toBe(AgentVaultSessionStatus.Revoked);
  });

  // An identity can be named "", so a session is on someone's behalf when the name is set, not when it's truthy.
  test("an empty acting identity name still marks an on-behalf-of session", () => {
    const session = { ...live, userId: "user-1", actingIdentityId: null, actingIdentityName: "" };
    expect(isOrphanedSession(session)).toBe(true);
    expect(deriveSessionStatus(session)).toBe(AgentVaultSessionStatus.Revoked);
  });

  test("an on-behalf-of session with both its user and its acting identity is active", () => {
    const session = { ...live, userId: "user-1", actingIdentityId: "identity-1", actingIdentityName: "slack-bot" };
    expect(isOrphanedSession(session)).toBe(false);
    expect(deriveSessionStatus(session)).toBe(AgentVaultSessionStatus.Active);
  });
});

describe("agent vault session ownership", () => {
  const onBehalfOf = { userId: "user-1", identityId: null, actingIdentityId: "identity-1" };

  test("the user and the identity that started it on their behalf both hold the session", () => {
    expect(isSessionOwnedBy({ actor: ActorType.USER, actorId: "user-1" }, onBehalfOf)).toBe(true);
    expect(isSessionOwnedBy({ actor: ActorType.IDENTITY, actorId: "identity-1" }, onBehalfOf)).toBe(true);
  });

  // Ids of users and identities are both UUIDs, so the actor type has to be matched as well as the id.
  test("an id is matched only against the column for its actor type", () => {
    expect(isSessionOwnedBy({ actor: ActorType.USER, actorId: "identity-1" }, onBehalfOf)).toBe(false);
    expect(isSessionOwnedBy({ actor: ActorType.IDENTITY, actorId: "user-1" }, onBehalfOf)).toBe(false);
  });
});

describe("describeSessionForAudit", () => {
  test("names a user's session by email, and the bundle it carried", () => {
    expect(
      describeSessionForAudit({
        actor: {
          type: AgentVaultMemberType.User,
          id: "u1",
          username: "alice",
          email: "alice@example.com",
          firstName: "Alice",
          lastName: null
        },
        accessBundles: [{ name: "release" }]
      })
    ).toEqual({ sessionOwner: "alice@example.com", accessBundleName: "release" });
  });

  test("falls back to the username when a user has no email", () => {
    expect(
      describeSessionForAudit({
        actor: {
          type: AgentVaultMemberType.User,
          id: null,
          username: "alice",
          email: null,
          firstName: null,
          lastName: null
        },
        accessBundles: [{ name: "release" }]
      }).sessionOwner
    ).toBe("alice");
  });

  test("names a machine identity's session by the identity, and allows a session with no bundle left", () => {
    expect(
      describeSessionForAudit({
        actor: { type: AgentVaultMemberType.MachineIdentity, id: "i1", name: "github-actions" },
        accessBundles: []
      })
    ).toEqual({ sessionOwner: "github-actions", accessBundleName: null });
  });
});
