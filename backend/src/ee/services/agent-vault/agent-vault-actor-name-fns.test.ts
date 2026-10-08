import { describe, expect, test } from "vitest";

import { auditActorFields } from "./agent-vault-actor-name-fns";
import { AgentVaultMemberType } from "./agent-vault-enums";

describe("auditActorFields", () => {
  test("names a user by username and email", () => {
    expect(
      auditActorFields({
        type: AgentVaultMemberType.User,
        id: "user-1",
        actorName: { name: "m249913@one.example.com", email: "robert@example.com" }
      })
    ).toEqual({ userId: "user-1", userName: "m249913@one.example.com", userEmail: "robert@example.com" });
  });

  test("leaves userEmail out for a user with no email", () => {
    expect(
      auditActorFields({ type: AgentVaultMemberType.User, id: "user-1", actorName: { name: "robert", email: null } })
    ).toEqual({ userId: "user-1", userName: "robert" });
  });

  test("names a machine identity and a group, never with an email", () => {
    expect(
      auditActorFields({
        type: AgentVaultMemberType.MachineIdentity,
        id: "identity-1",
        actorName: { name: "ci-runner" }
      })
    ).toEqual({ machineIdentityId: "identity-1", machineIdentityName: "ci-runner" });
    expect(
      auditActorFields({ type: AgentVaultMemberType.Group, id: "group-1", actorName: { name: "platform" } })
    ).toEqual({ groupId: "group-1", groupName: "platform" });
  });

  // An actor deleted between the write and the name lookup still has to be recorded by id.
  test("still records the id when the name could not be resolved", () => {
    expect(auditActorFields({ type: AgentVaultMemberType.Group, id: "group-1" })).toEqual({
      groupId: "group-1",
      groupName: undefined
    });
  });
});
