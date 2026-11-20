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
  leaseType: NeonLeaseType.Branch,
  parentBranchId: "br-staging-9",
  databaseName: "neondb",
  roleName: "neondb_owner",
  pooled: false,
  resetRolePassword: true,
  setBranchExpiration: true
};

describe("Neon dynamic secret form", () => {
  it.each([
    [NeonLeaseType.Role, "branchId"],
    [NeonLeaseType.Branch, "roleName"]
  ])("requires the %s lease field %s", (leaseType, field) => {
    const result = neonCreateFormSchema.safeParse(formValues({ leaseType }));
    assert.equal(result.success, false);
    assert.deepEqual(result.error?.issues[0].path, ["inputs", field]);
  });

  it.each([
    [NeonLeaseType.Role, "inputs.branchId"],
    [NeonLeaseType.Branch, "inputs.parentBranchId"]
  ])("rejects a malformed project ID and %s branch ID", (leaseType, branchField) => {
    const result = neonCreateFormSchema.safeParse(
      formValues({
        leaseType,
        projectId: "Not A Project",
        branchId: "br/../x",
        parentBranchId: "br/../y",
        roleName: "neondb_owner"
      })
    );
    assert.equal(result.success, false);
    assert.deepEqual(
      result.error?.issues.map((issue) => issue.path.join(".")),
      ["inputs.projectId", branchField]
    );
  });

  it("ignores a hidden field of the other lease type", () => {
    const result = neonCreateFormSchema.safeParse(
      formValues({
        leaseType: NeonLeaseType.Branch,
        branchId: "br/../x",
        roleName: "neondb_owner"
      })
    );
    assert.equal(result.success, true);
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

  it("keeps the stored API key when left blank and sends a cleared parent branch as null", () => {
    const context = editContext(storedBranchInputs);
    const values = getNeonEditDefaultValues(context);
    assert.equal(values.inputs.apiKey, "");
    assert.equal(values.inputs.parentBranchId, "br-staging-9");

    const { inputs } = getNeonEditPayload(
      neonEditFormSchema.parse({
        ...values,
        inputs: { ...values.inputs, parentBranchId: "" }
      }),
      context
    ).data;
    assert.equal("apiKey" in (inputs as object), false);
    assert.equal((inputs as { parentBranchId?: string | null }).parentBranchId, null);
  });
});
