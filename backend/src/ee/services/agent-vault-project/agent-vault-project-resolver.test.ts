import { ProjectType, TableName } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { agentVaultProjectResolverFactory } from "./agent-vault-project-resolver";

const { logger } = vi.hoisted(() => ({ logger: { info: vi.fn() } }));
vi.mock("@app/lib/logger", () => ({ logger }));

type TProject = { id: string; orgId: string; type: ProjectType; createdAt: Date; deleteAfter: Date | null };

const ORG_ID = "1a2b3c4d-0000-4000-8000-000000000001";
const OTHER_ORG_ID = "1a2b3c4d-0000-4000-8000-000000000002";
const OLDEST_ID = "5d4c3b2a-0000-4000-8000-000000000010";
const NEWER_ID = "5d4c3b2a-0000-4000-8000-000000000011";
const SAME_TIME_ID = "5d4c3b2a-0000-4000-8000-000000000009";
const DELETED_ID = "5d4c3b2a-0000-4000-8000-000000000012";
const SECRETS_ID = "5d4c3b2a-0000-4000-8000-000000000013";
const FOREIGN_ID = "5d4c3b2a-0000-4000-8000-000000000014";

const project = (id: string, overrides: Partial<TProject> = {}): TProject => ({
  id,
  orgId: ORG_ID,
  type: ProjectType.AgentVault,
  createdAt: new Date("2026-02-01T00:00:00Z"),
  deleteAfter: null,
  ...overrides
});

// A projects table that answers the query shapes the resolver builds: equality filters, a null check, an ordering
// and a first/select.
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
      orderBy: (order: { column: keyof TProject; order: "asc" | "desc" }[]) => {
        rows = [...rows].sort((a, b) => {
          for (const { column, order: direction } of order) {
            const [left, right] = [a[column], b[column]] as (Date | string)[];
            if (left < right) return direction === "asc" ? -1 : 1;
            if (left > right) return direction === "asc" ? 1 : -1;
          }
          return 0;
        });
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
  const resolver = agentVaultProjectResolverFactory({ db: db as never, keyStore: { getItemPrimary: vi.fn() } });
  return { resolver, tables };
};

describe("agentVaultProjectResolver.resolve", () => {
  beforeEach(() => {
    logger.info.mockClear();
  });

  test("returns an explicit projectId that is an Agent Vault project in the org", async () => {
    const { resolver, tables } = buildResolver([project(OLDEST_ID), project(NEWER_ID)]);

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
      project(OLDEST_ID),
      project(FOREIGN_ID, { orgId: OTHER_ORG_ID }),
      project(SECRETS_ID, { type: ProjectType.SecretManager }),
      project(DELETED_ID, { deleteAfter: new Date("2026-12-01T00:00:00Z") })
    ]);

    const result = resolver.resolve(ORG_ID, projectId, context);
    await expect(result).rejects.toThrow(NotFoundError);
    await expect(result).rejects.toThrow(`Agent Vault project with ID '${projectId}' not found in this organization`);
  });

  test("without projectId falls back to the org's oldest live Agent Vault project and logs it", async () => {
    const { resolver } = buildResolver([
      project(NEWER_ID, { createdAt: new Date("2026-03-01T00:00:00Z") }),
      project(DELETED_ID, { createdAt: new Date("2025-01-01T00:00:00Z"), deleteAfter: new Date("2026-12-01") }),
      project(SECRETS_ID, { createdAt: new Date("2025-01-01T00:00:00Z"), type: ProjectType.SecretManager }),
      project(FOREIGN_ID, { createdAt: new Date("2025-01-01T00:00:00Z"), orgId: OTHER_ORG_ID }),
      project(OLDEST_ID, { createdAt: new Date("2026-02-01T00:00:00Z") })
    ]);

    await expect(resolver.resolve(ORG_ID, undefined, context)).resolves.toBe(OLDEST_ID);
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [message] = logger.info.mock.calls[0] as [string];
    expect(message).toContain(`[orgId=${ORG_ID}]`);
    expect(message).toContain(`[projectId=${OLDEST_ID}]`);
    expect(message).toContain(`[route=${context.route}]`);
  });

  test("breaks a createdAt tie by id", async () => {
    const createdAt = new Date("2026-02-01T00:00:00Z");
    const { resolver } = buildResolver([project(OLDEST_ID, { createdAt }), project(SAME_TIME_ID, { createdAt })]);

    await expect(resolver.resolve(ORG_ID, undefined, context)).resolves.toBe(SAME_TIME_ID);
  });

  test("without projectId is a 400 when the org has no live Agent Vault project", async () => {
    const { resolver } = buildResolver([
      project(DELETED_ID, { deleteAfter: new Date("2026-12-01T00:00:00Z") }),
      project(SECRETS_ID, { type: ProjectType.SecretManager })
    ]);

    await expect(resolver.resolve(ORG_ID, undefined, context)).rejects.toThrow(BadRequestError);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
