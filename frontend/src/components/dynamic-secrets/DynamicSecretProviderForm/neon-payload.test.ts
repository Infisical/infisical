import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { DynamicSecretProviders, NeonLeaseType } from "@app/hooks/api/dynamicSecret/types";

import {
  getNeonCreateDefaultValues,
  getNeonCreatePayload,
  getNeonEditDefaultValues,
  getNeonEditPayload,
  neonCreateFormSchema,
  neonEditFormSchema
} from "./providerDefinitions/neonContract";
import type {
  TCreateDynamicSecretProviderFormContext,
  TEditDynamicSecretProviderFormContext
} from "./types";

const createContext = {
  projectSlug: "project",
  secretPath: "/",
  environments: [{ name: "Development", slug: "dev" }],
  isSingleEnvironmentMode: true
} as unknown as TCreateDynamicSecretProviderFormContext;

const formValues = (inputs: Record<string, unknown>) => {
  const defaults = getNeonCreateDefaultValues(createContext);
  return {
    ...defaults,
    name: "neon-preview",
    inputs: { ...defaults.inputs, apiKey: "napi_key", projectId: "shiny-wind-028834", ...inputs }
  };
};

describe("Neon dynamic secret form", () => {
  it("requires a branch ID for role leases", () => {
    const result = neonCreateFormSchema.safeParse(formValues({ leaseType: NeonLeaseType.Role }));
    assert.equal(result.success, false);
    assert.deepEqual(result.error?.issues[0].path, ["inputs", "branchId"]);
  });

  it("requires a role for branch leases but not a parent branch", () => {
    const missingRole = neonCreateFormSchema.safeParse(
      formValues({ leaseType: NeonLeaseType.Branch, roleName: "" })
    );
    assert.equal(missingRole.success, false);
    assert.deepEqual(missingRole.error?.issues[0].path, ["inputs", "roleName"]);

    const valid = neonCreateFormSchema.safeParse(
      formValues({ leaseType: NeonLeaseType.Branch, branchId: "" })
    );
    assert.equal(valid.success, true);
  });

  it("rejects malformed project and branch IDs", () => {
    const result = neonCreateFormSchema.safeParse(
      formValues({ projectId: "Not A Project", branchId: "br/../x" })
    );
    assert.equal(result.success, false);
    assert.deepEqual(
      result.error?.issues.map((issue) => issue.path.join(".")),
      ["inputs.projectId", "inputs.branchId"]
    );
  });

  it("drops branch-only settings from role lease payloads", () => {
    const payload = getNeonCreatePayload(
      formValues({ leaseType: NeonLeaseType.Role, branchId: "br-main-1", pooled: true }),
      createContext
    );
    assert.equal(payload.provider.type, DynamicSecretProviders.Neon);
    assert.deepEqual(payload.provider.inputs, {
      apiKey: "napi_key",
      projectId: "shiny-wind-028834",
      leaseType: NeonLeaseType.Role,
      branchId: "br-main-1",
      databaseName: "neondb",
      roleName: undefined,
      pooled: true,
      resetRolePassword: true,
      setBranchExpiration: false
    });
    assert.equal(payload.environmentSlug, "dev");
  });

  it("sends an empty parent branch as unset so the default branch is used", () => {
    const payload = getNeonCreatePayload(
      formValues({ leaseType: NeonLeaseType.Branch, branchId: "", setBranchExpiration: true }),
      createContext
    );
    assert.equal(payload.provider.inputs.branchId, undefined);
    assert.equal(payload.provider.inputs.roleName, "neondb_owner");
    assert.equal(payload.provider.inputs.setBranchExpiration, true);
  });

  it("keeps the stored API key when the edit form leaves it blank", () => {
    const editContext: TEditDynamicSecretProviderFormContext = {
      projectSlug: "project",
      secretPath: "/",
      environment: "dev",
      dynamicSecret: {
        id: "dynamic-secret-id",
        name: "neon-preview",
        type: DynamicSecretProviders.Neon,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        defaultTTL: "1h",
        maxTTL: "24h",
        // the API never returns the stored apiKey
        inputs: {
          projectId: "shiny-wind-028834",
          leaseType: NeonLeaseType.Branch,
          databaseName: "neondb",
          roleName: "neondb_owner"
        }
      }
    };

    const values = getNeonEditDefaultValues(editContext);
    assert.equal(values.inputs.apiKey, "");
    assert.equal(neonEditFormSchema.safeParse(values).success, true);

    const keep = getNeonEditPayload(values, editContext);
    assert.equal("apiKey" in (keep.data.inputs as object), true);
    assert.equal((keep.data.inputs as { apiKey?: string }).apiKey, undefined);

    const replace = getNeonEditPayload(
      { ...values, inputs: { ...values.inputs, apiKey: " napi_new " } },
      editContext
    );
    assert.equal((replace.data.inputs as { apiKey?: string }).apiKey, "napi_new");
  });
});
