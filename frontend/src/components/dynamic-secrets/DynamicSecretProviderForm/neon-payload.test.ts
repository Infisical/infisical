import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { DynamicSecretProviders, NeonLeaseType } from "@app/hooks/api/dynamicSecret/types";

import {
  getNeonCreateDefaultValues,
  getNeonCreatePayload,
  getNeonEditDefaultValues,
  getNeonEditPayload,
  neonCreateFormSchema,
  neonEditFormSchema,
  TNeonFormValues
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

const formValues = (inputs: Partial<TNeonFormValues["inputs"]>): TNeonFormValues => {
  const defaults = getNeonCreateDefaultValues(createContext);
  return {
    ...defaults,
    name: "neon-preview",
    inputs: { ...defaults.inputs, apiKey: "napi_key", projectId: "shiny-wind-028834", ...inputs }
  };
};

// the form shell validates with the schema and hands the parsed values to toPayload
const createPayload = (inputs: Partial<TNeonFormValues["inputs"]>) =>
  getNeonCreatePayload(neonCreateFormSchema.parse(formValues(inputs)), createContext);

const editContext = (inputs: object): TEditDynamicSecretProviderFormContext => ({
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
    inputs: inputs as never
  }
});

const storedBranchInputs = {
  projectId: "shiny-wind-028834",
  baseUrl: "https://neon.example.com/api/v2",
  leaseType: NeonLeaseType.Branch,
  parentBranchId: "br-staging-9",
  databaseName: "neondb",
  roleName: "neondb_owner",
  pooled: false,
  resetRolePassword: true,
  setBranchExpiration: true
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
      formValues({ leaseType: NeonLeaseType.Branch, roleName: "neondb_owner" })
    );
    assert.equal(valid.success, true);
  });

  it("rejects malformed project and branch IDs", () => {
    const result = neonCreateFormSchema.safeParse(
      formValues({ projectId: "Not A Project", branchId: "br/../x", parentBranchId: "br/../y" })
    );
    assert.equal(result.success, false);
    assert.deepEqual(
      result.error?.issues.map((issue) => issue.path.join(".")),
      ["inputs.projectId", "inputs.branchId", "inputs.parentBranchId"]
    );
  });

  it("sends only the role lease fields for role leases", () => {
    const payload = createPayload({
      leaseType: NeonLeaseType.Role,
      branchId: "br-main-1",
      parentBranchId: "br-staging-9",
      roleName: "neondb_owner",
      pooled: true
    });
    assert.equal(payload.provider.type, DynamicSecretProviders.Neon);
    assert.deepEqual(payload.provider.inputs, {
      apiKey: "napi_key",
      baseUrl: null,
      projectId: "shiny-wind-028834",
      leaseType: NeonLeaseType.Role,
      branchId: "br-main-1",
      databaseName: "neondb",
      pooled: true
    });
    assert.equal(payload.environmentSlug, "dev");
  });

  it("sends only the branch lease fields, with an empty parent branch as null", () => {
    const payload = createPayload({
      leaseType: NeonLeaseType.Branch,
      branchId: "br-main-1",
      roleName: "neondb_owner",
      setBranchExpiration: true
    });
    assert.deepEqual(payload.provider.inputs, {
      apiKey: "napi_key",
      baseUrl: null,
      projectId: "shiny-wind-028834",
      leaseType: NeonLeaseType.Branch,
      parentBranchId: null,
      databaseName: "neondb",
      roleName: "neondb_owner",
      pooled: false,
      resetRolePassword: true,
      setBranchExpiration: true
    });
  });

  it("sends a self-hosted API base URL and an empty one as null for Neon's hosted API", () => {
    const selfHosted = createPayload({
      branchId: "br-main-1",
      baseUrl: " https://neon.example.com/api/v2 "
    });
    assert.equal(selfHosted.provider.inputs.baseUrl, "https://neon.example.com/api/v2");

    assert.equal(
      createPayload({ branchId: "br-main-1", baseUrl: "" }).provider.inputs.baseUrl,
      null
    );

    const invalid = neonCreateFormSchema.safeParse(
      formValues({ branchId: "br-main-1", baseUrl: "neon.example.com" })
    );
    assert.equal(invalid.success, false);
    assert.deepEqual(invalid.error?.issues[0].path, ["inputs", "baseUrl"]);
  });

  it("keeps the stored API key when the edit form leaves it blank", () => {
    const context = editContext(storedBranchInputs);
    const values = getNeonEditDefaultValues(context);
    assert.equal(values.inputs.apiKey, "");
    assert.equal(values.inputs.parentBranchId, "br-staging-9");

    const keep = getNeonEditPayload(neonEditFormSchema.parse(values), context);
    assert.equal("apiKey" in (keep.data.inputs as object), false);

    const replace = getNeonEditPayload(
      neonEditFormSchema.parse({ ...values, inputs: { ...values.inputs, apiKey: " napi_new " } }),
      context
    );
    assert.equal((replace.data.inputs as { apiKey?: string }).apiKey, "napi_new");
  });

  it("sends cleared optional fields as null so the edit removes them", () => {
    const context = editContext(storedBranchInputs);
    const values = getNeonEditDefaultValues(context);

    const cleared = getNeonEditPayload(
      neonEditFormSchema.parse({
        ...values,
        inputs: { ...values.inputs, baseUrl: "", parentBranchId: "" }
      }),
      context
    );
    assert.equal((cleared.data.inputs as { baseUrl?: string | null }).baseUrl, null);
    assert.equal((cleared.data.inputs as { parentBranchId?: string | null }).parentBranchId, null);
  });
});
