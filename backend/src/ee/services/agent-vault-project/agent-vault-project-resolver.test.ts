import { ActionProjectType, ProjectType, TableName } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { agentVaultProjectResolverFactory } from "./agent-vault-project-resolver";

const { logger } = vi.hoisted(() => ({ logger: { info: vi.fn() } }));
vi.mock("@app/lib/logger", () => ({ logger }));

type TProject = {
  id: string;
  orgId: string;
  type: ProjectType;
  createdAt: Date;
  deleteAfter: Date | null;
  isAgentVaultOriginal: boolean;
};

const ORG_ID = "1a2b3c4d-0000-4000-8000-000000000001";
const OTHER_ORG_ID = "1a2b3c4d-0000-4000-8000-000000000002";
const ORIGINAL_ID = "5d4c3b2a-0000-4000-8000-000000000010";
const NEWER_ID = "5d4c3b2a-0000-4000-8000-000000000011";
const DELETED_ID = "5d4c3b2a-0000-4000-8000-000000000012";
const SECRETS_ID = "5d4c3b2a-0000-4000-8000-000000000013";
const FOREIGN_ID = "5d4c3b2a-0000-4000-8000-000000000014";

const project = (id: string, overrides: Partial<TProject> = {}): TProject => ({
  id,
  orgId: ORG_ID,
  type: ProjectType.AgentVault,
  createdAt: new Date("2026-02-01T00:00:00Z"),
  deleteAfter: null,
  isAgentVaultOriginal: false,
  ...overrides
});

// A projects table that answers the query shapes the resolver builds: equality filters, a null check and a
// first/select.
const buildDb = (projects: TProject[]) => {
  const tables: string[] = [];
  const db = (table: string) => {
    tables.push(table);
    let rows = [...projects];
    const chain = {
      where: (filter: Partial<TProject>) => {
        rows = rows.filter((row) =>
          Object.entries(filter).every(([column, value]) => row[column as keyof TProject] === value)
        );
        return chain;
      },
      whereNull: (column: keyof TProject) => {
        rows = rows.filter((row) => row[column] === null);
        return chain;
      },
      first: async () => (rows[0] ? { id: rows[0].id } : undefined),
      select: async () => rows.map((row) => ({ id: row.id }))
    };
    return chain;
  };
  return { db, tables };
};

const context = { route: "GET /api/v1/agent-vault/access-bundles", actorId: "actor", actorType: "user" };

const buildResolver = (projects: TProject[]) => {
  const { db, tables } = buildDb(projects);
  const resolver = agentVaultProjectResolverFactory({
    db: db as never,
    keyStore: { getItemPrimary: vi.fn() },
    permissionService: { getProjectPermission: vi.fn() }
  });
  return { resolver, tables };
};

describe("agentVaultProjectResolver.resolve", () => {
  beforeEach(() => {
    logger.info.mockClear();
  });

  test("returns an explicit projectId that is an Agent Vault project in the org", async () => {
    const { resolver, tables } = buildResolver([project(ORIGINAL_ID), project(NEWER_ID)]);

    await expect(resolver.resolve(ORG_ID, NEWER_ID, context)).resolves.toBe(NEWER_ID);
    expect(tables).toEqual([TableName.Project]);
    expect(logger.info).not.toHaveBeenCalled();
  });

  test.each([
    ["in another org", FOREIGN_ID],
    ["of another type", SECRETS_ID],
    ["pending deletion", DELETED_ID],
    ["missing", "5d4c3b2a-0000-4000-8000-000000000099"]
  ])("is a 404 for a project %s", async (_label, projectId) => {
    const { resolver } = buildResolver([
      project(ORIGINAL_ID),
      project(FOREIGN_ID, { orgId: OTHER_ORG_ID }),
      project(SECRETS_ID, { type: ProjectType.SecretManager }),
      project(DELETED_ID, { deleteAfter: new Date("2026-12-01T00:00:00Z") })
    ]);

    const result = resolver.resolve(ORG_ID, projectId, context);
    await expect(result).rejects.toThrow(NotFoundError);
    await expect(result).rejects.toThrow(`Agent Vault project with ID '${projectId}' not found in this organization`);
  });

  test("without projectId falls back to the org's original Agent Vault project and logs it", async () => {
    const { resolver } = buildResolver([
      project(NEWER_ID, { createdAt: new Date("2026-03-01T00:00:00Z") }),
      project(SECRETS_ID, { type: ProjectType.SecretManager, isAgentVaultOriginal: true }),
      project(FOREIGN_ID, { orgId: OTHER_ORG_ID, isAgentVaultOriginal: true }),
      project(ORIGINAL_ID, { createdAt: new Date("2026-02-01T00:00:00Z"), isAgentVaultOriginal: true })
    ]);

    await expect(resolver.resolve(ORG_ID, undefined, context)).resolves.toBe(ORIGINAL_ID);
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [message] = logger.info.mock.calls[0] as [string];
    expect(message).toContain(`[orgId=${ORG_ID}]`);
    expect(message).toContain(`[projectId=${ORIGINAL_ID}]`);
    expect(message).toContain(`[route=${context.route}]`);
  });

  test.each([
    ["the org has no Agent Vault project", [] as TProject[]],
    ["no project is the original", [project(NEWER_ID)]],
    [
      "the original is pending deletion",
      [
        project(NEWER_ID),
        project(DELETED_ID, { deleteAfter: new Date("2026-12-01T00:00:00Z"), isAgentVaultOriginal: true })
      ]
    ],
    [
      "only another org's project is the original",
      [project(FOREIGN_ID, { orgId: OTHER_ORG_ID, isAgentVaultOriginal: true })]
    ]
  ])("without projectId is a 400 asking for projectId when %s", async (_label, projects) => {
    const { resolver } = buildResolver(projects);

    const result = resolver.resolve(ORG_ID, undefined, context);
    await expect(result).rejects.toThrow(BadRequestError);
    await expect(result).rejects.toThrow("Pass the ID of the Agent Vault project to use as projectId");
    expect(logger.info).not.toHaveBeenCalled();
  });
});

const ctx = {
  actor: ActorType.USER,
  actorId: "actor",
  actorAuthMethod: AuthMethod.EMAIL,
  actorOrgId: ORG_ID
};
const BUNDLE_ID = "7e6d5c4b-0000-4000-8000-000000000001";
const AUTHORIZATION_ID = "7e6d5c4b-0000-4000-8000-000000000002";

const membershipNotFound = () =>
  new ForbiddenRequestError({ name: "ProjectMembershipNotFound", message: "You are not a member of this project" });

// A row table whose join to projects either finds the row's live Agent Vault project in the org or nothing.
const buildRowResolver = ({
  rowProjectId,
  storedAuthorization,
  getProjectPermission = vi.fn()
}: {
  rowProjectId?: string;
  storedAuthorization?: { projectId: string };
  getProjectPermission?: ReturnType<typeof vi.fn>;
}) => {
  const filters: unknown[][] = [];
  const db = () => {
    const chain = {
      join: () => chain,
      where: (...args: unknown[]) => {
        filters.push(args);
        return chain;
      },
      whereNull: () => chain,
      first: async () => (rowProjectId ? { projectId: rowProjectId, id: rowProjectId } : undefined)
    };
    return chain;
  };
  const resolver = agentVaultProjectResolverFactory({
    db: db as never,
    keyStore: {
      getItemPrimary: vi.fn().mockResolvedValue(storedAuthorization ? JSON.stringify(storedAuthorization) : null)
    },
    permissionService: { getProjectPermission: getProjectPermission as never }
  });
  return { resolver, filters, getProjectPermission };
};

describe("agentVaultProjectResolver.resolveFromAccessBundle", () => {
  test("returns the row's project after checking the actor's Agent Vault permission there", async () => {
    const { resolver, filters, getProjectPermission } = buildRowResolver({ rowProjectId: NEWER_ID });

    await expect(resolver.resolveFromAccessBundle(ctx, BUNDLE_ID)).resolves.toBe(NEWER_ID);
    expect(filters).toContainEqual([`${TableName.Project}.orgId`, ORG_ID]);
    expect(getProjectPermission).toHaveBeenCalledWith({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId: NEWER_ID,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ORG_ID,
      actionProjectType: ActionProjectType.AgentVault
    });
  });

  test("is the bundle's 404 when the row is not in a live Agent Vault project of the org", async () => {
    const { resolver, getProjectPermission } = buildRowResolver({});

    const result = resolver.resolveFromAccessBundle(ctx, BUNDLE_ID);
    await expect(result).rejects.toThrow(NotFoundError);
    await expect(result).rejects.toThrow(`Access bundle with ID '${BUNDLE_ID}' not found`);
    expect(getProjectPermission).not.toHaveBeenCalled();
  });

  test("is the bundle's 404, not a 403, when the actor is not a member of the row's project", async () => {
    const { resolver } = buildRowResolver({
      rowProjectId: NEWER_ID,
      getProjectPermission: vi.fn().mockRejectedValue(membershipNotFound())
    });

    const result = resolver.resolveFromAccessBundle(ctx, BUNDLE_ID);
    await expect(result).rejects.toThrow(NotFoundError);
    await expect(result).rejects.toThrow(`Access bundle with ID '${BUNDLE_ID}' not found`);
  });

  test("passes any other permission error through", async () => {
    const error = new ForbiddenRequestError({ message: "This project does not belong to your selected organization." });
    const { resolver } = buildRowResolver({
      rowProjectId: NEWER_ID,
      getProjectPermission: vi.fn().mockRejectedValue(error)
    });

    await expect(resolver.resolveFromAccessBundle(ctx, BUNDLE_ID)).rejects.toBe(error);
  });
});

describe("agentVaultProjectResolver.resolveFromAuthorization", () => {
  test("returns the authorization's project for a member", async () => {
    const { resolver } = buildRowResolver({ rowProjectId: NEWER_ID, storedAuthorization: { projectId: NEWER_ID } });

    await expect(resolver.resolveFromAuthorization(ctx, AUTHORIZATION_ID)).resolves.toBe(NEWER_ID);
  });

  test("is the authorization's 404 when the actor is not a member of its project", async () => {
    const { resolver } = buildRowResolver({
      rowProjectId: NEWER_ID,
      storedAuthorization: { projectId: NEWER_ID },
      getProjectPermission: vi.fn().mockRejectedValue(membershipNotFound())
    });

    const result = resolver.resolveFromAuthorization(ctx, AUTHORIZATION_ID);
    await expect(result).rejects.toThrow(NotFoundError);
    await expect(result).rejects.toThrow(`Authorization with ID '${AUTHORIZATION_ID}' not found`);
  });
});
