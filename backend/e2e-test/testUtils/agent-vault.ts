import { ProjectType } from "@app/db/schemas";

type TMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Every spec shares the seeded org, so delete each project a spec creates.
export const createAgentVaultProject = async (dto: { authToken: string; name: string }) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: { projectName: dto.name, type: ProjectType.AgentVault }
  });
  expect(res.statusCode, res.payload).toBe(200);
  return res.json().project.id as string;
};

export const deleteAgentVaultProject = async (dto: { authToken: string; projectId: string }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/projects/${dto.projectId}`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });
  expect(res.statusCode, res.payload).toBe(200);
};

// A request without projectId goes to the org's project marked isAgentVaultOriginal. Production gets the mark from a
// migration, which ran before any project here existed, so a spec marks the project it wants that request to reach.
// The column has no API, which is why this writes the row.
export const markAgentVaultProjectOriginal = async (dto: { orgId: string; projectId: string }) => {
  await testDb("projects")
    .where({ orgId: dto.orgId, type: ProjectType.AgentVault })
    .update({ isAgentVaultOriginal: false });
  await testDb("projects").where({ id: dto.projectId }).update({ isAgentVaultOriginal: true });
};

// The routes that act on a whole project rather than on one row, so they name the project themselves.
const PROJECT_LEVEL_PATHS = new Set([
  "/api/v1/agent-vault/access-bundles",
  "/api/v1/agent-vault/variables",
  "/api/v1/agent-vault/skills",
  "/api/v1/agent-vault/proxies",
  "/api/v1/agent-vault/sessions",
  "/api/v1/agent-vault/members",
  "/api/v1/agent-vault/members/available",
  "/api/v1/agent-vault/settings/session-logs",
  "/api/v1/agent-vault/settings/session-logs/health",
  "/api/v1/agent-vault/settings/session-logs/cors-probe"
]);

// Session log settings and delegations take the project in the query string on every method. A delegation is
// addressed by its machine identity, which can belong to several projects.
const QUERY_ON_EVERY_METHOD = ["/api/v1/agent-vault/settings/session-logs", "/api/v1/agent-vault/delegations"];

// Adds projectId to a project-level request that does not already carry one, in the query for reads and the
// settings routes and in the body for other writes. By-id routes take the project from the row and pass through.
export const scopeAgentVaultRequest = (
  projectId: string,
  method: TMethod,
  url: string,
  body?: Record<string, unknown>
): { url: string; body?: Record<string, unknown> } => {
  const [path, query] = url.split("?");
  const isQueryOnEveryMethod = QUERY_ON_EVERY_METHOD.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (!PROJECT_LEVEL_PATHS.has(path) && !isQueryOnEveryMethod) return { url, body };

  if (method === "GET" || isQueryOnEveryMethod) {
    if (query && new URLSearchParams(query).has("projectId")) return { url, body };
    return { url: `${path}?projectId=${projectId}${query ? `&${query}` : ""}`, body };
  }

  if (body && "projectId" in body) return { url, body };
  return { url, body: { projectId, ...(body ?? {}) } };
};

// A request helper bound to one bearer token and one Agent Vault project.
export const agentVaultRequester =
  (token: string, projectId: () => string) => (method: TMethod, url: string, body?: Record<string, unknown>) => {
    const scoped = scopeAgentVaultRequest(projectId(), method, url, body);
    return testServer.inject({
      method,
      url: scoped.url,
      headers: { authorization: `Bearer ${token}` },
      ...(scoped.body ? { body: scoped.body } : {})
    });
  };
