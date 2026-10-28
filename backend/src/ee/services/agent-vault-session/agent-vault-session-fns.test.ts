import { describe, expect, test } from "vitest";

import { AgentVaultMemberType } from "../agent-vault/agent-vault-enums";
import { describeSessionForAudit } from "./agent-vault-session-fns";

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
