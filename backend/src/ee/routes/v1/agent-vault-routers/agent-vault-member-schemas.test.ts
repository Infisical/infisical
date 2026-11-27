import { describe, expect, test } from "vitest";

import {
  AgentVaultMemberIdsSchema,
  AgentVaultProductMemberAddSchema,
  AgentVaultProductMemberIdsSchema,
  AgentVaultProductMemberRoleUpdateSchema
} from "./agent-vault-schemas";

const USER_ID = "8a6f2c1e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const IDENTITY_ID = "1f2e3d4c-5b6a-4978-8897-a6b5c4d3e2f1";
const GROUP_ID = "0a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d";

const upperCaseIds = {
  userIds: [USER_ID.toUpperCase()],
  machineIdentityIds: [IDENTITY_ID.toUpperCase()],
  groupIds: [GROUP_ID.toUpperCase()]
};

// A role's conditions compare ids exactly, so an id has to reach them in the case the database returns.
describe("member ids are lowercased", () => {
  test.each([
    ["AgentVaultMemberIdsSchema", AgentVaultMemberIdsSchema, upperCaseIds],
    ["AgentVaultProductMemberIdsSchema", AgentVaultProductMemberIdsSchema, upperCaseIds],
    ["AgentVaultProductMemberAddSchema", AgentVaultProductMemberAddSchema, { ...upperCaseIds, roles: ["admin"] }],
    [
      "AgentVaultProductMemberRoleUpdateSchema",
      AgentVaultProductMemberRoleUpdateSchema,
      { ...upperCaseIds, roles: ["admin"] }
    ]
  ])("%s", (_name, schema, body) => {
    expect(schema.parse(body)).toMatchObject({
      userIds: [USER_ID],
      machineIdentityIds: [IDENTITY_ID],
      groupIds: [GROUP_ID]
    });
  });
});

describe("member roles", () => {
  test("a list longer than a member can hold is refused with the limit", () => {
    const result = AgentVaultProductMemberAddSchema.safeParse({
      userIds: [USER_ID],
      roles: Array.from({ length: 11 }, (_, index) => `role-${index}`)
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain("A member can have at most 10 roles.");
  });

  test("a request that names no roles is refused rather than given a default", () => {
    expect(AgentVaultProductMemberAddSchema.safeParse({ userIds: [USER_ID] }).success).toBe(false);
  });
});
