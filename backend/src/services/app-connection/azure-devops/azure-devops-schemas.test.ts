import { describe, expect, it } from "vitest";

import { AzureDevOpsConnectionManagedIdentityInputCredentialsSchema } from "./azure-devops-schemas";

const isValidOrgName = (orgName?: string) =>
  AzureDevOpsConnectionManagedIdentityInputCredentialsSchema.safeParse({
    tenantId: "00000000-0000-0000-0000-000000000000",
    clientId: "00000000-0000-0000-0000-000000000000",
    orgName
  }).success;

describe("Azure DevOps managed identity organization name", () => {
  it.each(["contoso", "Contoso-Dev", "a", "1org", " contoso ", "a".repeat(50)])("accepts %s", (orgName) => {
    expect(isValidOrgName(orgName)).toBe(true);
  });

  it.each([
    "-contoso",
    "contoso-",
    "contoso_dev",
    "contoso.dev",
    "contoso/dev",
    "contoso dev",
    "a".repeat(51),
    "",
    "   ",
    undefined
  ])("rejects %s", (orgName) => {
    expect(isValidOrgName(orgName)).toBe(false);
  });
});
