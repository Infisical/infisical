import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import { DynamicSecretProviders, SqlProviders } from "@app/hooks/api/dynamicSecret/types";

import { testDynamicSecretProviderContract } from "./providerContractTestHarness";
import { createDynamicSecretProviderRegistry, defineDynamicSecretProviderModule } from "./registry";
import { parseDynamicSecretProviderNumberInput } from "./scalarValues";
import {
  createDynamicSecretProviderFormSchema,
  DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  editDynamicSecretProviderFormSchema,
  normalizeDynamicSecretGatewayValueForMode,
  normalizeDynamicSecretUsernameTemplateForCreate,
  normalizeDynamicSecretUsernameTemplateForEdit
} from "./schemas";
import {
  defineDynamicSecretProvider,
  TCreateDynamicSecretProviderFormContext,
  TEditDynamicSecretProviderFormContext
} from "./types";

const createInputsSchema = z.object({
  host: z.string().min(1, "Host is required"),
  port: z.number().int().positive(),
  password: z.string().min(1, "Password is required"),
  engine: z.literal("postgres"),
  enabled: z.boolean(),
  connection: z.object({
    gatewayId: z.string().optional(),
    gatewayPoolId: z.string().optional()
  }),
  statements: z.object({
    creation: z.string().min(1),
    revocation: z.string().min(1)
  })
});

const editInputsSchema = createInputsSchema.extend({
  connection: z.object({
    gatewayId: z.string().nullable().optional(),
    gatewayPoolId: z.string().nullable().optional()
  })
});

const createFormSchema = createDynamicSecretProviderFormSchema(createInputsSchema);
const editFormSchema = editDynamicSecretProviderFormSchema(editInputsSchema);

type TCreateFixtureValues = z.infer<typeof createFormSchema>;
type TEditFixtureValues = z.infer<typeof editFormSchema>;

const FixtureCustomRenderer = () => null;

const fixtureDefinition = defineDynamicSecretProvider<
  DynamicSecretProviders.SqlDatabase,
  TCreateFixtureValues,
  TEditFixtureValues
>({
  provider: DynamicSecretProviders.SqlDatabase,
  label: "Test SQL",
  fields: [
    { name: "inputs.host", type: "text", label: "Host", layout: "half" },
    { name: "inputs.port", type: "number", label: "Port", layout: "half", min: 1 },
    {
      name: "inputs.password",
      type: "secret",
      label: "Password",
      autoComplete: "new-password"
    },
    {
      name: "inputs.engine",
      type: "select",
      label: "Engine",
      options: [{ label: "PostgreSQL", value: "postgres" }]
    },
    { name: "inputs.enabled", type: "switch", label: "Enabled" },
    {
      kind: "group",
      id: "statements",
      presentation: "collapse",
      title: "Statements",
      fields: [
        { name: "inputs.statements.creation", type: "textarea", label: "Creation Statement" },
        { name: "inputs.statements.revocation", type: "textarea", label: "Revocation Statement" }
      ]
    }
  ],
  customRenderer: {
    reasons: ["remote-options", "non-scalar-value"],
    Component: FixtureCustomRenderer
  },
  create: {
    schema: createFormSchema,
    getDefaultValues: (context) => ({
      name: "",
      defaultTTL: "1h",
      maxTTL: "24h",
      environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
      usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
      inputs: {
        host: "",
        port: 5432,
        password: "",
        engine: "postgres",
        enabled: true,
        connection: {
          gatewayId: undefined,
          gatewayPoolId: undefined
        },
        statements: {
          creation: "CREATE USER",
          revocation: "DROP USER"
        }
      }
    }),
    toPayload: (values, context) => {
      const gatewayId = normalizeDynamicSecretGatewayValueForMode(
        "create",
        values.inputs.connection.gatewayId
      );
      const usernameTemplate = normalizeDynamicSecretUsernameTemplateForCreate(
        values.usernameTemplate
      );

      return {
        projectSlug: context.projectSlug,
        path: context.secretPath,
        name: values.name,
        environmentSlug: values.environment.slug,
        defaultTTL: values.defaultTTL,
        ...(values.maxTTL ? { maxTTL: values.maxTTL } : {}),
        ...(usernameTemplate ? { usernameTemplate } : {}),
        provider: {
          type: DynamicSecretProviders.SqlDatabase,
          inputs: {
            client: SqlProviders.Postgres,
            host: values.inputs.host,
            port: values.inputs.port,
            database: "postgres",
            username: "postgres",
            password: values.inputs.password,
            creationStatement: values.inputs.statements.creation,
            revocationStatement: values.inputs.statements.revocation,
            ...(gatewayId ? { gatewayId } : {})
          }
        }
      };
    },
    submitLabel: "Create Dynamic Secret"
  },
  edit: {
    schema: editFormSchema,
    getDefaultValues: (context) => ({
      name: context.dynamicSecret.name,
      defaultTTL: context.dynamicSecret.defaultTTL,
      maxTTL: context.dynamicSecret.maxTTL ?? null,
      usernameTemplate:
        context.dynamicSecret.usernameTemplate ?? DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
      inputs: context.dynamicSecret.inputs as TEditFixtureValues["inputs"]
    }),
    toPayload: (values, context) => ({
      projectSlug: context.projectSlug,
      path: context.secretPath,
      environmentSlug: context.environment,
      name: context.dynamicSecret.name,
      data: {
        newName: values.name,
        defaultTTL: values.defaultTTL,
        maxTTL: values.maxTTL,
        usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate),
        inputs: {
          ...values.inputs,
          connection: {
            gatewayId: normalizeDynamicSecretGatewayValueForMode(
              "edit",
              values.inputs.connection.gatewayId
            ),
            gatewayPoolId: normalizeDynamicSecretGatewayValueForMode(
              "edit",
              values.inputs.connection.gatewayPoolId
            )
          }
        }
      }
    }),
    submitLabel: "Save Changes",
    successMessage: "Dynamic secret updated"
  }
});

const environment = { id: "env-id", name: "Development", slug: "dev" };
const createContext: TCreateDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environments: [environment],
  isSingleEnvironmentMode: true
};
const editInputs: TEditFixtureValues["inputs"] = {
  host: "database.example.com",
  port: 5432,
  password: "********",
  engine: "postgres",
  enabled: true,
  connection: { gatewayId: null, gatewayPoolId: null },
  statements: { creation: "CREATE USER", revocation: "DROP USER" }
};
const editContext: TEditDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environment: "dev",
  dynamicSecret: {
    id: "dynamic-secret-id",
    name: "existing-secret",
    type: DynamicSecretProviders.SqlDatabase,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    defaultTTL: "1h",
    maxTTL: "24h",
    usernameTemplate: null,
    inputs: editInputs
  }
};
const createValues: TCreateFixtureValues = {
  name: "test-secret",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    host: "database.example.com",
    port: 5432,
    password: "new-password",
    engine: "postgres",
    enabled: true,
    connection: { gatewayId: undefined, gatewayPoolId: undefined },
    statements: { creation: "CREATE USER", revocation: "DROP USER" }
  }
};
const editValues: TEditFixtureValues = {
  name: "renamed-secret",
  defaultTTL: "2h",
  maxTTL: null,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: editInputs
};

testDynamicSecretProviderContract({
  name: "test-only SQL fixture",
  definition: fixtureDefinition,
  create: {
    context: createContext,
    defaultValues: {
      name: "",
      defaultTTL: "1h",
      maxTTL: "24h",
      environment,
      usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
      inputs: {
        host: "",
        port: 5432,
        password: "",
        engine: "postgres",
        enabled: true,
        connection: { gatewayId: undefined, gatewayPoolId: undefined },
        statements: { creation: "CREATE USER", revocation: "DROP USER" }
      }
    },
    validValues: createValues,
    payload: {
      projectSlug: "project",
      path: "/folder",
      name: "test-secret",
      environmentSlug: "dev",
      defaultTTL: "1h",
      maxTTL: "24h",
      provider: {
        type: DynamicSecretProviders.SqlDatabase,
        inputs: {
          client: SqlProviders.Postgres,
          host: "database.example.com",
          port: 5432,
          database: "postgres",
          username: "postgres",
          password: "new-password",
          creationStatement: "CREATE USER",
          revocationStatement: "DROP USER"
        }
      }
    },
    invalidValues: [
      {
        name: "provider validation paths",
        values: {
          ...createValues,
          inputs: { ...createValues.inputs, host: "", password: "" }
        },
        issuePaths: [
          ["inputs", "host"],
          ["inputs", "password"]
        ]
      }
    ]
  },
  edit: {
    context: editContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
      inputs: editInputs
    },
    validValues: editValues,
    payload: {
      projectSlug: "project",
      path: "/folder",
      environmentSlug: "dev",
      name: "existing-secret",
      data: {
        newName: "renamed-secret",
        defaultTTL: "2h",
        maxTTL: null,
        usernameTemplate: null,
        inputs: editInputs
      }
    },
    maskedValues: [
      {
        name: "provider password",
        expected: "********",
        defaultValuePath: ["inputs", "password"],
        payloadValuePath: ["data", "inputs", "password"]
      }
    ]
  }
});

describe("shared dynamic-secret scalar behavior", () => {
  it("emits numbers before z.number validation", () => {
    const parsedPort = parseDynamicSecretProviderNumberInput("6432");

    assert.equal(parsedPort, 6432);
    assert.equal(typeof parsedPort, "number");
    assert.equal(
      createFormSchema.safeParse({
        ...createValues,
        inputs: { ...createValues.inputs, port: parsedPort }
      }).success,
      true
    );
    assert.equal(parseDynamicSecretProviderNumberInput(""), undefined);
    assert.equal(parseDynamicSecretProviderNumberInput("not-a-number"), undefined);
  });

  it("keeps scalar and custom-renderer paths explicit", () => {
    const fields = fixtureDefinition.fields ?? [];
    const flatTypes = fields.flatMap((item) => ("kind" in item ? [] : [item.type]));

    assert.deepEqual(flatTypes, ["text", "number", "secret", "select", "switch"]);
    const groupedTypes = fields.flatMap((item) =>
      "kind" in item ? item.fields.map((field) => field.type) : []
    );
    assert.deepEqual(groupedTypes, ["textarea", "textarea"]);
    assert.deepEqual(fixtureDefinition.customRenderer?.reasons, [
      "remote-options",
      "non-scalar-value"
    ]);
  });
});

describe("shared dynamic-secret normalization", () => {
  it("preserves TTL bounds and messages", () => {
    const belowMinimum = createFormSchema.safeParse({ ...createValues, defaultTTL: "30s" });
    const aboveMaximum = createFormSchema.safeParse({ ...createValues, defaultTTL: "11y" });

    assert.equal(belowMinimum.success, false);
    assert.equal(aboveMaximum.success, false);
    if (!belowMinimum.success) {
      assert.equal(belowMinimum.error.issues[0]?.message, "TTL must be a greater than 1min");
    }
    if (!aboveMaximum.success) {
      assert.equal(aboveMaximum.error.issues[0]?.message, "TTL must be less than 10 years");
    }
  });

  it("keeps username-template and gateway create/edit semantics distinct", () => {
    assert.equal(
      normalizeDynamicSecretUsernameTemplateForCreate(DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE),
      undefined
    );
    assert.equal(
      normalizeDynamicSecretUsernameTemplateForEdit(DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE),
      null
    );
    assert.equal(normalizeDynamicSecretGatewayValueForMode("create", null), undefined);
    assert.equal(normalizeDynamicSecretGatewayValueForMode("edit", null), null);
    assert.equal(normalizeDynamicSecretGatewayValueForMode("edit", "gateway-id"), "gateway-id");
  });
});

describe("dynamic-secret provider registry composition", () => {
  const fixtureModule = defineDynamicSecretProviderModule({
    id: "test-only",
    definitions: [fixtureDefinition]
  });

  it("composes batch modules without exposing mutable registry state", () => {
    const registry = createDynamicSecretProviderRegistry(fixtureModule);

    assert.deepEqual(registry.providers, [DynamicSecretProviders.SqlDatabase]);
    assert.equal(registry.getDefinition(DynamicSecretProviders.SqlDatabase), fixtureDefinition);
    assert.equal(registry.getDefinition(DynamicSecretProviders.Redis), undefined);
    assert.equal(registry.getDocsSlug(DynamicSecretProviders.SqlDatabase), "postgresql");
    assert.equal(Object.isFrozen(registry.providers), true);
    assert.equal(Object.isFrozen(registry.definitions), true);
  });

  it("rejects duplicate modules and providers", () => {
    assert.throws(
      () => createDynamicSecretProviderRegistry(fixtureModule, fixtureModule),
      /module "test-only" was registered more than once/
    );
    assert.throws(
      () =>
        createDynamicSecretProviderRegistry(
          fixtureModule,
          defineDynamicSecretProviderModule({
            id: "duplicate-provider",
            definitions: [fixtureDefinition]
          })
        ),
      /provider "sql-database" was registered more than once/
    );
  });
});
