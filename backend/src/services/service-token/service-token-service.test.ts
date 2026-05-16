import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { conditionsMatcher, PermissionConditionOperators } from "@app/lib/casl";
import { crypto } from "@app/lib/crypto";

import { serviceTokenServiceFactory } from "./service-token-service";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    SALT_ROUNDS: 1
  })
}));

vi.mock("@app/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

const PROJECT_ID = "project-id";
const ACTOR_ID = "actor-id";
const ACTOR_ORG_ID = "org-id";
const ENV_SLUG = "dev";

type AbilityFn = (builder: AbilityBuilder<MongoAbility<ProjectPermissionSet>>) => void;

const buildAbility = (configure: AbilityFn) => {
  const builder = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);
  configure(builder);
  return builder.build({ conditionsMatcher });
};

const grantServiceTokenCreate = (b: AbilityBuilder<MongoAbility<ProjectPermissionSet>>) => {
  b.can(ProjectPermissionActions.Create, ProjectPermissionSub.ServiceTokens);
};

// Wrapper that lets us pass partial-shape conditions (e.g., $eq via plain string for secretPath) without
// fighting CASL's strict per-action condition schema. Mirrors the @ts-expect-error pattern used in
// `buildServiceTokenProjectPermission`.
const canWithConditions = (
  b: AbilityBuilder<MongoAbility<ProjectPermissionSet>>,
  action: string,
  subj: string,
  conditions: Record<string, unknown>
) => {
  // @ts-expect-error CASL's per-action condition schema is too narrow for our test inputs.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  b.can(action, subj, conditions);
};

const createService = (permission: MongoAbility<ProjectPermissionSet>) => {
  const permissionService = {
    getProjectPermission: vi.fn().mockResolvedValue({
      permission,
      memberships: [],
      hasRole: () => false,
      hasProjectEnforcement: () => undefined
    })
  };

  const projectEnvDAL = {
    findBySlugs: vi
      .fn()
      .mockImplementation((_projectId: string, slugs: string[]) =>
        Promise.resolve(slugs.map((slug) => ({ slug, id: `${slug}-id` })))
      )
  };

  const serviceTokenDAL = {
    create: vi
      .fn()
      .mockImplementation((row: Record<string, unknown>) => Promise.resolve({ ...row, id: "stub-service-token-id" })),
    findById: vi.fn(),
    deleteById: vi.fn(),
    find: vi.fn(),
    findExpiringTokens: vi.fn(),
    update: vi.fn()
  };

  const orgDAL = { findById: vi.fn() };
  const projectDAL = { findById: vi.fn() };
  const userDAL = { findById: vi.fn() };
  const accessTokenQueue = { updateServiceTokenStatus: vi.fn() };
  const smtpService = { sendMail: vi.fn() };

  const service = serviceTokenServiceFactory({
    serviceTokenDAL: serviceTokenDAL as never,
    userDAL: userDAL as never,
    permissionService: permissionService as never,
    projectEnvDAL: projectEnvDAL as never,
    projectDAL: projectDAL as never,
    accessTokenQueue: accessTokenQueue as never,
    smtpService: smtpService as never,
    orgDAL: orgDAL as never
  });

  return { service, serviceTokenDAL, permissionService };
};

const callCreate = ({
  service,
  scopes,
  permissions
}: {
  service: ReturnType<typeof createService>["service"];
  scopes: Array<{ environment: string; secretPath: string }>;
  permissions: ("read" | "write")[];
}) =>
  service.createServiceToken({
    actor: "user" as never,
    actorId: ACTOR_ID,
    actorOrgId: ACTOR_ORG_ID,
    actorAuthMethod: undefined as never,
    projectId: PROJECT_ID,
    name: "test-token",
    scopes,
    permissions,
    encryptedKey: "ek",
    iv: "iv",
    tag: "tag",
    expiresIn: null
  });

describe("createServiceToken authorization", () => {
  beforeAll(async () => {
    process.env.FIPS_ENABLED = "false";
    await crypto.initialize({} as never, {} as never, {} as never);
  });

  afterAll(() => {
    delete process.env.FIPS_ENABLED;
  });

  describe("read capability — legacy umbrella vs granular halves", () => {
    test("legacy umbrella role can mint a read token", async () => {
      const permission = buildAbility((b) => {
        grantServiceTokenCreate(b);
        // Legacy: a single rule granting `Read` (= DescribeAndReadValue) on the secret subjects
        [ProjectPermissionSub.Secrets, ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach(
          (subj) => {
            b.can(ProjectPermissionActions.Read, subj);
            b.can(ProjectPermissionSecretActions.Create, subj);
          }
        );
      });

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({ service, scopes: [{ environment: ENV_SLUG, secretPath: "/" }], permissions: ["read"] })
      ).resolves.toBeDefined();
      expect(serviceTokenDAL.create).toHaveBeenCalledTimes(1);
    });

    // Realistic V2 caller shape: Secrets supports granular actions (ReadValue + DescribeSecret),
    // while SecretFolders / SecretImports only support ProjectPermissionActions (plain Read). The
    // granular boundary fallback in createServiceToken must therefore grant ReadValue+DescribeSecret
    // on Secrets and plain Read on SecretFolders/SecretImports; otherwise it would emit
    // (readValue|describeSecret, SecretFolders|SecretImports) rules that no V2 caller can satisfy.
    test("granular pair on Secrets + plain Read on folders/imports can mint a read token", async () => {
      const permission = buildAbility((b) => {
        grantServiceTokenCreate(b);
        b.can(ProjectPermissionSecretActions.ReadValue, ProjectPermissionSub.Secrets);
        b.can(ProjectPermissionSecretActions.DescribeSecret, ProjectPermissionSub.Secrets);
        b.can(ProjectPermissionSecretActions.Create, ProjectPermissionSub.Secrets);
        [ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach((subj) => {
          b.can(ProjectPermissionActions.Read, subj);
          b.can(ProjectPermissionActions.Create, subj);
        });
      });

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({ service, scopes: [{ environment: ENV_SLUG, secretPath: "/" }], permissions: ["read"] })
      ).resolves.toBeDefined();
      expect(serviceTokenDAL.create).toHaveBeenCalledTimes(1);
    });

    test("only ReadValue (no DescribeSecret) is rejected", async () => {
      const permission = buildAbility((b) => {
        grantServiceTokenCreate(b);
        [ProjectPermissionSub.Secrets, ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach(
          (subj) => {
            b.can(ProjectPermissionSecretActions.ReadValue, subj);
            b.can(ProjectPermissionSecretActions.Create, subj);
          }
        );
      });

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({ service, scopes: [{ environment: ENV_SLUG, secretPath: "/" }], permissions: ["read"] })
      ).rejects.toThrow();
      expect(serviceTokenDAL.create).not.toHaveBeenCalled();
    });

    test("only DescribeSecret (no ReadValue) is rejected", async () => {
      const permission = buildAbility((b) => {
        grantServiceTokenCreate(b);
        [ProjectPermissionSub.Secrets, ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach(
          (subj) => {
            b.can(ProjectPermissionSecretActions.DescribeSecret, subj);
            b.can(ProjectPermissionSecretActions.Create, subj);
          }
        );
      });

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({ service, scopes: [{ environment: ENV_SLUG, secretPath: "/" }], permissions: ["read"] })
      ).rejects.toThrow();
      expect(serviceTokenDAL.create).not.toHaveBeenCalled();
    });
  });

  describe("write capability", () => {
    test("caller with Edit + Delete + Create can mint a write token", async () => {
      const permission = buildAbility((b) => {
        grantServiceTokenCreate(b);
        [ProjectPermissionSub.Secrets, ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach(
          (subj) => {
            b.can(ProjectPermissionSecretActions.Create, subj);
            b.can(ProjectPermissionSecretActions.Edit, subj);
            b.can(ProjectPermissionSecretActions.Delete, subj);
          }
        );
      });

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({ service, scopes: [{ environment: ENV_SLUG, secretPath: "/" }], permissions: ["write"] })
      ).resolves.toBeDefined();
      expect(serviceTokenDAL.create).toHaveBeenCalledTimes(1);
    });

    test("create-only caller cannot mint write or read+write token (action escalation, the original CVE)", async () => {
      const permission = buildAbility((b) => {
        grantServiceTokenCreate(b);
        [ProjectPermissionSub.Secrets, ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach(
          (subj) => {
            b.can(ProjectPermissionSecretActions.Create, subj);
          }
        );
      });

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({
          service,
          scopes: [{ environment: ENV_SLUG, secretPath: "/" }],
          permissions: ["read", "write"]
        })
      ).rejects.toThrow();
      expect(serviceTokenDAL.create).not.toHaveBeenCalled();
    });

    test("caller with Edit but no Delete is rejected for a write token", async () => {
      const permission = buildAbility((b) => {
        grantServiceTokenCreate(b);
        [ProjectPermissionSub.Secrets, ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach(
          (subj) => {
            b.can(ProjectPermissionSecretActions.Create, subj);
            b.can(ProjectPermissionSecretActions.Edit, subj);
          }
        );
      });

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({ service, scopes: [{ environment: ENV_SLUG, secretPath: "/" }], permissions: ["write"] })
      ).rejects.toThrow();
      expect(serviceTokenDAL.create).not.toHaveBeenCalled();
    });
  });

  describe("scope widening (boundary check)", () => {
    // Caller permissions mirror the realistic V2 schema: granular actions on Secrets
    // and ProjectPermissionActions on SecretImports / SecretFolders. Both bound by the
    // same condition so the only variable under test is the requested token scope.
    const grantV2ScopedPermissions = (
      b: AbilityBuilder<MongoAbility<ProjectPermissionSet>>,
      conditions: Record<string, unknown>
    ) => {
      grantServiceTokenCreate(b);
      canWithConditions(b, ProjectPermissionSecretActions.Create, ProjectPermissionSub.Secrets, conditions);
      canWithConditions(b, ProjectPermissionSecretActions.Edit, ProjectPermissionSub.Secrets, conditions);
      canWithConditions(b, ProjectPermissionSecretActions.Delete, ProjectPermissionSub.Secrets, conditions);
      canWithConditions(b, ProjectPermissionSecretActions.ReadValue, ProjectPermissionSub.Secrets, conditions);
      canWithConditions(b, ProjectPermissionSecretActions.DescribeSecret, ProjectPermissionSub.Secrets, conditions);
      [ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach((subj) => {
        canWithConditions(b, ProjectPermissionActions.Read, subj, conditions);
        canWithConditions(b, ProjectPermissionActions.Create, subj, conditions);
        canWithConditions(b, ProjectPermissionActions.Edit, subj, conditions);
        canWithConditions(b, ProjectPermissionActions.Delete, subj, conditions);
      });
    };

    test("caller with $eq:'/apps/foo' cannot mint token with secretPath='/apps/**' (eq → glob)", async () => {
      const conditions = { secretPath: "/apps/foo", environment: ENV_SLUG };
      const permission = buildAbility((b) => grantV2ScopedPermissions(b, conditions));

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({
          service,
          scopes: [{ environment: ENV_SLUG, secretPath: "/apps/**" }],
          permissions: ["read", "write"]
        })
      ).rejects.toThrow();
      expect(serviceTokenDAL.create).not.toHaveBeenCalled();
    });

    test("caller with $eq:'/apps/foo' can mint token with the literal secretPath='/apps/foo' (no widening)", async () => {
      const conditions = { secretPath: "/apps/foo", environment: ENV_SLUG };
      const permission = buildAbility((b) => grantV2ScopedPermissions(b, conditions));

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({
          service,
          scopes: [{ environment: ENV_SLUG, secretPath: "/apps/foo" }],
          permissions: ["read", "write"]
        })
      ).resolves.toBeDefined();
      expect(serviceTokenDAL.create).toHaveBeenCalledTimes(1);
    });

    // Regression: glob → broader-glob widening was previously allowed because the boundary check
    // used `picomatch.isMatch` to compare a subset glob against a parent glob as if the subset
    // were a literal value, so `/apps/**` matched `/apps/*` (the literal `**` is two non-`/`
    // characters and matches `*`). The fix in `boundary.ts` switched to a sound glob-set
    // containment check.
    test("caller with $glob:'/apps/*' cannot mint token with secretPath='/apps/**' (glob → broader glob)", async () => {
      const conditions = {
        secretPath: { [PermissionConditionOperators.$GLOB]: "/apps/*" },
        environment: ENV_SLUG
      };
      const permission = buildAbility((b) => grantV2ScopedPermissions(b, conditions));

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({
          service,
          scopes: [{ environment: ENV_SLUG, secretPath: "/apps/**" }],
          permissions: ["read", "write"]
        })
      ).rejects.toThrow();
      expect(serviceTokenDAL.create).not.toHaveBeenCalled();
    });

    test("caller with $glob:'/apps/**' can mint token with secretPath='/apps/foo' (narrower)", async () => {
      const conditions = {
        secretPath: { [PermissionConditionOperators.$GLOB]: "/apps/**" },
        environment: ENV_SLUG
      };
      const permission = buildAbility((b) => grantV2ScopedPermissions(b, conditions));

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({
          service,
          scopes: [{ environment: ENV_SLUG, secretPath: "/apps/foo" }],
          permissions: ["read", "write"]
        })
      ).resolves.toBeDefined();
      expect(serviceTokenDAL.create).toHaveBeenCalledTimes(1);
    });

    // Regression: a caller with a positive unconditional rule plus an inverted (deny) rule
    // narrower than the requested token scope was previously allowed to mint, even though the
    // resulting token grants access inside the deny region. Now overlap with the deny region —
    // including the case where the subset is broader than the deny — fails the boundary check.
    // The boundary check for a legacy "read" service token mints a token rule using
    // `ProjectPermissionActions.Read` ("read") on each secret subject. To exercise the inverted-
    // overlap path, the caller must have a deny rule on the SAME action — `Read` — at a narrower
    // scope than the token's requested scope. Then the boundary check sees a positive rule plus
    // a conditional inverted rule for action="read", and rejects the token because the requested
    // glob (`/**`) overlaps the deny region (`/secret/**`).
    const grantUnconditionalSecretActions = (b: AbilityBuilder<MongoAbility<ProjectPermissionSet>>) => {
      grantServiceTokenCreate(b);
      [ProjectPermissionSub.Secrets, ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach(
        (subj) => {
          b.can(ProjectPermissionActions.Read, subj);
          b.can(ProjectPermissionSecretActions.ReadValue, subj);
          b.can(ProjectPermissionSecretActions.DescribeSecret, subj);
          b.can(ProjectPermissionSecretActions.Create, subj);
        }
      );
    };

    test("caller with deny Read on '/secret/**' cannot mint token with secretPath='/**' (inverted overlap)", async () => {
      const permission = buildAbility((b) => {
        grantUnconditionalSecretActions(b);
        [ProjectPermissionSub.Secrets, ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach(
          (subj) => {
            // @ts-expect-error CASL's per-action condition schema doesn't expose $glob, but the
            // conditionsMatcher resolves it at runtime; same pattern is used in production rules.
            b.cannot(ProjectPermissionActions.Read, subj, { secretPath: { $glob: "/secret/**" } });
          }
        );
      });

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({
          service,
          scopes: [{ environment: ENV_SLUG, secretPath: "/**" }],
          permissions: ["read"]
        })
      ).rejects.toThrow();
      expect(serviceTokenDAL.create).not.toHaveBeenCalled();
    });

    test("caller with deny Read on '/secret/**' can mint token with secretPath='/apps/**' (no overlap)", async () => {
      const permission = buildAbility((b) => {
        grantUnconditionalSecretActions(b);
        [ProjectPermissionSub.Secrets, ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach(
          (subj) => {
            // @ts-expect-error CASL's per-action condition schema doesn't expose $glob, but the
            // conditionsMatcher resolves it at runtime; same pattern is used in production rules.
            b.cannot(ProjectPermissionActions.Read, subj, { secretPath: { $glob: "/secret/**" } });
          }
        );
      });

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({
          service,
          scopes: [{ environment: ENV_SLUG, secretPath: "/apps/**" }],
          permissions: ["read"]
        })
      ).resolves.toBeDefined();
      expect(serviceTokenDAL.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("admin-equivalent role (full unconditioned permissions)", () => {
    test("can mint read+write token with recursive scope (regression for happy path)", async () => {
      const permission = buildAbility((b) => {
        grantServiceTokenCreate(b);
        [ProjectPermissionSub.Secrets, ProjectPermissionSub.SecretImports, ProjectPermissionSub.SecretFolders].forEach(
          (subj) => {
            b.can(ProjectPermissionActions.Read, subj);
            b.can(ProjectPermissionSecretActions.ReadValue, subj);
            b.can(ProjectPermissionSecretActions.DescribeSecret, subj);
            b.can(ProjectPermissionSecretActions.Create, subj);
            b.can(ProjectPermissionSecretActions.Edit, subj);
            b.can(ProjectPermissionSecretActions.Delete, subj);
          }
        );
      });

      const { service, serviceTokenDAL } = createService(permission);

      await expect(
        callCreate({
          service,
          scopes: [{ environment: ENV_SLUG, secretPath: "/**" }],
          permissions: ["read", "write"]
        })
      ).resolves.toBeDefined();
      expect(serviceTokenDAL.create).toHaveBeenCalledTimes(1);
    });
  });
});
