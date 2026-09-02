import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApproverType, BypasserType } from "@app/hooks/api/accessApproval/types";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

import { getApproverOptionLabel, getEmptyApprovalStepIndexes } from "./approvalPolicyFormUtils";

const member = (id: string, firstName: string, lastName: string): TWorkspaceUser =>
  ({
    inviteEmail: "",
    user: { id, firstName, lastName, username: `${firstName}@infisical.com`, email: "" }
  }) as TWorkspaceUser;

const group = (id: string, name: string): TGroupMembership =>
  ({ group: { id, name } }) as TGroupMembership;

describe("approval policy form steps", () => {
  it("identifies every access-policy sequence without an approver", () => {
    const emptySteps = getEmptyApprovalStepIndexes([
      { user: [{ id: "user-id" }], group: [] },
      { user: [], group: [] },
      { user: [], group: [{ id: "group-id" }] },
      { user: [], group: [] }
    ]);

    assert.deepEqual(emptySteps, [1, 3]);
  });
});

describe("approval policy option labels", () => {
  const members = [member("user-1", "Ada", "Lovelace")];
  const groups = [group("group-1", "Engineering")];

  it("resolves a user id to the member display name", () => {
    assert.equal(
      getApproverOptionLabel({ type: ApproverType.User, id: "user-1" }, members, groups),
      "Ada Lovelace"
    );
  });

  it("resolves a group id to the group name", () => {
    assert.equal(
      getApproverOptionLabel({ type: ApproverType.Group, id: "group-1" }, members, groups),
      "Engineering"
    );
  });

  it("falls back to name, username, then id when the member is missing", () => {
    assert.equal(
      getApproverOptionLabel(
        { type: ApproverType.User, id: "removed", name: "Former user" },
        members,
        groups
      ),
      "Former user"
    );
    assert.equal(
      getApproverOptionLabel(
        { type: ApproverType.User, id: "removed", username: "gone@infisical.com" },
        members,
        groups
      ),
      "gone@infisical.com"
    );
    assert.equal(
      getApproverOptionLabel({ type: ApproverType.User, id: "removed" }, members, groups),
      "removed"
    );
  });

  it("uses the entered email for members created by username only", () => {
    assert.equal(
      getApproverOptionLabel(
        { type: BypasserType.User, username: "new@infisical.com", name: "new@infisical.com" },
        members,
        groups
      ),
      "new@infisical.com"
    );
  });
});
