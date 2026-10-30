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

  // The name outlives the user, which is how the row still says it was started on someone's behalf.
  test("an on-behalf-of session whose user was deleted reads as revoked", () => {
    const session = { ...live, identityId: "identity-1", onBehalfOfUserId: null, onBehalfOfUserName: "Alice Nguyen" };
    expect(isOrphanedSession(session)).toBe(true);
    expect(deriveSessionStatus(session)).toBe(AgentVaultSessionStatus.Revoked);
  });

  test("an on-behalf-of session with both its identity and its user is active", () => {
    const session = {
      ...live,
      identityId: "identity-1",
      onBehalfOfUserId: "user-1",
      onBehalfOfUserName: "Alice Nguyen"
    };
    expect(isOrphanedSession(session)).toBe(false);
    expect(deriveSessionStatus(session)).toBe(AgentVaultSessionStatus.Active);
  });
});

describe("agent vault session ownership", () => {
  const onBehalfOf = { userId: null, identityId: "identity-1", onBehalfOfUserId: "user-1" };

  test("only the identity holds a session it started on a user's behalf, not the user", () => {
    expect(isSessionOwnedBy({ actor: ActorType.IDENTITY, actorId: "identity-1" }, onBehalfOf)).toBe(true);
    expect(isSessionOwnedBy({ actor: ActorType.USER, actorId: "user-1" }, onBehalfOf)).toBe(false);
  });

  // Ids of users and identities are both UUIDs, so the actor type has to be matched as well as the id.
  test("an id is matched only against the column for its actor type", () => {
    const own = { userId: "user-1", identityId: null };
    expect(isSessionOwnedBy({ actor: ActorType.USER, actorId: "user-1" }, own)).toBe(true);
    expect(isSessionOwnedBy({ actor: ActorType.IDENTITY, actorId: "user-1" }, own)).toBe(false);
    expect(isSessionOwnedBy({ actor: ActorType.USER, actorId: "identity-1" }, onBehalfOf)).toBe(false);
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
        onBehalfOf: null,
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
        onBehalfOf: null,
        accessBundles: [{ name: "release" }]
      }).sessionOwner
    ).toBe("alice");
  });

  test("names a machine identity's session by the identity, and allows a session with no bundle left", () => {
    expect(
      describeSessionForAudit({
        actor: { type: AgentVaultMemberType.MachineIdentity, id: "i1", name: "github-actions" },
        onBehalfOf: null,
        accessBundles: []
      })
    ).toEqual({ sessionOwner: "github-actions", accessBundleName: null });
  });

  test("names the identity as the owner of a session on a user's behalf, and the user it acts for", () => {
    const user = {
      type: AgentVaultMemberType.User as const,
      username: "alice",
      firstName: "Alice",
      lastName: null
    };
    expect(
      describeSessionForAudit({
        actor: { type: AgentVaultMemberType.MachineIdentity, id: "i1", name: "slack-assistant" },
        onBehalfOf: { ...user, id: "u1", email: "alice@example.com" },
        accessBundles: [{ name: "release" }]
      })
    ).toEqual({
      sessionOwner: "slack-assistant",
      accessBundleName: "release",
      onBehalfOfUserId: "u1",
      onBehalfOfUserName: "alice",
      onBehalfOfUserEmail: "alice@example.com"
    });

    // Once the user is deleted only the snapshot is left, with no id to record.
    expect(
      describeSessionForAudit({
        actor: { type: AgentVaultMemberType.MachineIdentity, id: "i1", name: "slack-assistant" },
        onBehalfOf: { ...user, id: null, email: null },
        accessBundles: []
      })
    ).toEqual({ sessionOwner: "slack-assistant", accessBundleName: null, onBehalfOfUserName: "alice" });
  });
});
