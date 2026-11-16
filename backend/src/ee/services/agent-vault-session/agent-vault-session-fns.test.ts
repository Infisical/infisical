import { describe, expect, test } from "vitest";

import { ActorType } from "@app/services/auth/auth-type";

import { AgentVaultMemberType, AgentVaultSessionStatus } from "../agent-vault/agent-vault-enums";
import {
  agentVaultSessionLabelUpdateSchema,
  agentVaultSessionMetadataSchema,
  deriveSessionStatus,
  describeSessionForAudit,
  isOrphanedSession,
  isSameSessionMetadata,
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
        accessBundle: { name: "release" }
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
        accessBundle: { name: "release" }
      }).sessionOwner
    ).toBe("alice");
  });

  test("names a machine identity's session by the identity", () => {
    expect(
      describeSessionForAudit({
        actor: { type: AgentVaultMemberType.MachineIdentity, id: "i1", name: "github-actions" },
        onBehalfOf: null,
        accessBundle: { name: "deploy" }
      })
    ).toEqual({ sessionOwner: "github-actions", accessBundleName: "deploy" });
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
        accessBundle: { name: "release" }
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
        accessBundle: { name: "release" }
      })
    ).toEqual({ sessionOwner: "slack-assistant", accessBundleName: "release", onBehalfOfUserName: "alice" });
  });
});

describe("agent vault session metadata", () => {
  const messagesOf = (input: unknown) => {
    const result = agentVaultSessionMetadataSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  };

  test("trims keys and values and keeps the order they were sent in", () => {
    const parsed = agentVaultSessionMetadataSchema.parse({ " runId ": " 8812 ", slackChannel: "#deploys", note: "" });
    expect(Object.entries(parsed)).toEqual([
      ["runId", "8812"],
      ["slackChannel", "#deploys"],
      ["note", ""]
    ]);
  });

  test("accepts up to 20 entries and refuses more", () => {
    const entries = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, index) => [`key${index}`, "value"]));
    expect(agentVaultSessionMetadataSchema.safeParse(entries(20)).success).toBe(true);
    expect(messagesOf(entries(21))).toEqual(["A session can have at most 20 metadata entries"]);
  });

  test("refuses two keys that are the same once trimmed", () => {
    expect(messagesOf({ runId: "1", "runId ": "2" })).toEqual([
      "The metadata key 'runId' appears more than once. Each key can be used once per session."
    ]);
  });

  test("refuses an empty or blank key", () => {
    expect(messagesOf({ "": "value" })).toEqual(["A metadata key can't be empty"]);
    expect(messagesOf({ "   ": "value" })).toEqual(["A metadata key can't be empty"]);
  });

  test("bounds key and value length", () => {
    expect(agentVaultSessionMetadataSchema.safeParse({ ["k".repeat(255)]: "v".repeat(1020) }).success).toBe(true);
    expect(messagesOf({ ["k".repeat(256)]: "v" })).toEqual(["A metadata key can be at most 255 characters"]);
    expect(messagesOf({ runId: "v".repeat(1021) })).toEqual([
      "The value of metadata key 'runId' can be at most 1020 characters"
    ]);
  });

  test("refuses invisible characters in a key or a value, so one entry can't pass for another", () => {
    const invisible = ["a\tb", "alice\u200b", "revo \u202eltr", "a\u2028b", "a\ue000b", "a\ud800b"];
    invisible.forEach((text) => {
      expect(messagesOf({ [text]: "value" })[0], JSON.stringify(text)).toContain("A metadata key can't contain");
      expect(messagesOf({ owner: text })[0], JSON.stringify(text)).toContain(
        "The value of metadata key 'owner' can't contain"
      );
    });
    expect(agentVaultSessionMetadataSchema.parse({ ticket: "PR #123 (prod): café, 部署 🚀" })).toEqual({
      ticket: "PR #123 (prod): café, 部署 🚀"
    });
  });

  test("refuses anything but string values", () => {
    expect(agentVaultSessionMetadataSchema.safeParse({ runId: 8812 }).success).toBe(false);
    expect(agentVaultSessionMetadataSchema.safeParse([["runId", "8812"]]).success).toBe(false);
  });

  test("compares two sets entry by entry, in order", () => {
    expect(isSameSessionMetadata({ a: "1", b: "2" }, { a: "1", b: "2" })).toBe(true);
    expect(isSameSessionMetadata({ a: "1", b: "2" }, { a: "1", b: "3" })).toBe(false);
    expect(isSameSessionMetadata({ a: "1" }, {})).toBe(false);
  });
});

describe("agent vault session label on update", () => {
  test("left out keeps the label, while null or blank removes it", () => {
    expect(agentVaultSessionLabelUpdateSchema.parse(undefined)).toBeUndefined();
    expect(agentVaultSessionLabelUpdateSchema.parse(null)).toBeNull();
    expect(agentVaultSessionLabelUpdateSchema.parse("   ")).toBeNull();
    expect(agentVaultSessionLabelUpdateSchema.parse(" nightly ")).toBe("nightly");
  });
});
