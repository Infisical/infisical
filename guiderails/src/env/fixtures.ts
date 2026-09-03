import crypto from "node:crypto";

import { InfisicalApi, type ProjectResult } from "./api.js";
import type { InstanceState } from "./bootstrap.js";

/**
 * Named, API-driven starting states. A guide declares which one it needs in its registry
 * entry, so the same guide always begins from the same place and a failure is attributable
 * to the guide rather than to leftover state from the previous run.
 *
 * Isolation unit is a fresh project per run, not a fresh stack. Restarting the stack per
 * guide would cost minutes; a fresh project costs one API call and gives the same freedom
 * from cross-run interference. Where a guide genuinely needs org-level isolation that would
 * have to change, and none of the registered guides do yet.
 *
 * Everything is built over the API rather than through the UI, so fixture setup never depends
 * on the very UI the guide is about to test. A broken button should fail the guide, not
 * silently prevent the guide from starting.
 */

export type FixtureContext = {
  api: InfisicalApi;
  state: InstanceState;
  /**
   * Org-scoped admin JWT, obtained the same way the browser gets one.
   *
   * Deliberately NOT the machine identity token that bootstrap returns. That token is
   * created with accessTokenTTL: 0, so its JWT carries no `exp` claim, so
   * fnValidateIdentityAccessTokenFast classifies it as a legacy token and rejects it once
   * now() is past LEGACY_IDENTITY_ACCESS_TOKEN_EXPIRATION_ENFORCED_AT (default 2026-05-04)
   * plus MAX_MACHINE_IDENTITY_TOKEN_AGE (default 90d). That cutoff has passed, so the
   * bootstrap token is dead on arrival on a default-configured instance and every call
   * returns 401 "exceeded max age".
   *
   * Using the admin user's JWT is also the better choice on its own merits: it is the same
   * credential the guide's reader holds, so fixture setup exercises the same authorization
   * path the walkthrough does.
   */
  token: string;
  /** Short unique suffix so parallel runs never collide on a name. */
  runId: string;
};

export type FixtureResult = {
  name: string;
  project: ProjectResult | null;
  /** Substitutions the compiler's `{{fixture.x}}` placeholders resolve against. */
  values: Record<string, string>;
  /** Human-readable summary for the report, so a reader knows the starting state. */
  describe: string[];
  /**
   * Where the runner opens the browser. Kept shallow on purpose: the agent should navigate
   * the way a reader does, because the navigation steps are part of what the guide claims.
   * Deep-linking past them would skip the very instructions under test.
   */
  entryPath: string;
};

/**
 * Frontend routes come from TanStack Router with several pathless layout segments
 * (`_authenticate`, `_inject-org-details`, `_org-layout`, `_secret-manager-layout`), which do
 * not appear in the URL. The real shape is below; guessing it from the page directory
 * structure produces a 404.
 */
const projectOverviewPath = (orgId: string, projectId: string): string =>
  `/organizations/${orgId}/projects/secret-management/${projectId}/overview`;

export type Fixture = {
  name: string;
  description: string;
  setup: (ctx: FixtureContext) => Promise<FixtureResult>;
};

const environmentSlug = (project: ProjectResult, preferred = "dev"): string => {
  const environments = project.environments ?? [];
  const match = environments.find((environment) => environment.slug === preferred);
  return match?.slug ?? environments[0]?.slug ?? "dev";
};

const freshOrg: Fixture = {
  name: "fresh-org",
  description: "The bootstrapped organization with no projects created by the harness.",
  setup: async (ctx) => ({
    name: "fresh-org",
    project: null,
    values: {
      orgId: ctx.state.organizationId,
      orgSlug: ctx.state.organizationSlug,
      projectName: `Guiderails ${ctx.runId}`,
      secretName: "DATABASE_URL"
    },
    describe: [
      `Organization ${ctx.state.organizationSlug} with no harness-created project.`,
      "Guide-created project and secret use deterministic fixture values."
    ],
    entryPath: "/"
  })
};

const orgWithProject: Fixture = {
  name: "org-with-project",
  description: "One empty Secret Manager project with the default environments.",
  setup: async (ctx) => {
    const projectName = `Guiderails ${ctx.runId}`;
    const project = await ctx.api.createProject(ctx.token, { projectName });

    return {
      name: "org-with-project",
      project,
      values: {
        orgId: ctx.state.organizationId,
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        environment: environmentSlug(project)
      },
      describe: [
        `Project "${project.name}" (${project.slug}) with default environments.`,
        "No secrets, folders, or extra members."
      ],
      entryPath: projectOverviewPath(ctx.state.organizationId, project.id)
    };
  }
};

const projectWithSecrets: Fixture = {
  name: "project-with-secrets",
  description:
    "A project with secrets and a folder in two environments, so comparison and " +
    "replication flows have something to act on.",
  setup: async (ctx) => {
    const projectName = `Guiderails ${ctx.runId}`;
    const project = await ctx.api.createProject(ctx.token, { projectName });

    const environments = (project.environments ?? []).slice(0, 2);
    if (environments.length === 0) {
      throw new Error(
        `Project ${project.slug} came back with no environments, so the fixture cannot seed ` +
          `secrets. Check that shouldCreateDefaultEnvs is still honoured.`
      );
    }

    for (const environment of environments) {
      await ctx.api.createSecret(ctx.token, {
        secretName: "DATABASE_URL",
        projectId: project.id,
        environment: environment.slug,
        secretValue: `postgres://guiderails@localhost:5432/${environment.slug}`
      });
      await ctx.api.createSecret(ctx.token, {
        secretName: "API_TIMEOUT_SECONDS",
        projectId: project.id,
        environment: environment.slug,
        secretValue: "30"
      });
    }

    // folder.mdx's comparison and replication procedures need a folder to point at.
    const primary = environments[0];
    if (primary) {
      await ctx.api.createFolder(ctx.token, {
        projectId: project.id,
        environment: primary.slug,
        name: "dev-folder"
      });
    }

    return {
      name: "project-with-secrets",
      project,
      values: {
        orgId: ctx.state.organizationId,
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        environment: primary?.slug ?? "dev",
        secondEnvironment: environments[1]?.slug ?? primary?.slug ?? "dev",
        folderName: "dev-folder",
        secretName: "DATABASE_URL"
      },
      describe: [
        `Project "${project.name}" (${project.slug}).`,
        `Secrets DATABASE_URL and API_TIMEOUT_SECONDS in ${environments
          .map((environment) => environment.slug)
          .join(" and ")}.`,
        `Folder "dev-folder" in ${primary?.slug ?? "dev"}.`
      ],
      entryPath: projectOverviewPath(ctx.state.organizationId, project.id)
    };
  }
};

const projectWithSecondMember: Fixture = {
  name: "project-with-second-member",
  description:
    "A project containing a second principal (a machine identity) to grant privileges to.",
  setup: async (ctx) => {
    const projectName = `Guiderails ${ctx.runId}`;
    const project = await ctx.api.createProject(ctx.token, { projectName });

    // A machine identity rather than a second human user, deliberately. bootstrapInstance
    // sets allowSignUp=false on non-cloud instances and the stack has no SMTP, so an invited
    // user could never finish signing up. Both access-control guides explicitly cover
    // "user or machine identity", so this walks a documented path rather than a workaround.
    const identityName = `guiderails-subject-${ctx.runId}`;
    const identity = await ctx.api.createProjectIdentity(ctx.token, {
      projectId: project.id,
      name: identityName
    });

    return {
      name: "project-with-second-member",
      project,
      values: {
        orgId: ctx.state.organizationId,
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        environment: environmentSlug(project),
        subjectName: identity.name,
        subjectId: identity.id
      },
      describe: [
        `Project "${project.name}" (${project.slug}).`,
        `Machine identity "${identity.name}" as the second principal.`,
        "Used where a guide needs somebody other than the acting admin to act on."
      ],
      entryPath: projectOverviewPath(ctx.state.organizationId, project.id)
    };
  }
};

export const FIXTURES: Record<string, Fixture> = {
  [freshOrg.name]: freshOrg,
  [orgWithProject.name]: orgWithProject,
  [projectWithSecrets.name]: projectWithSecrets,
  [projectWithSecondMember.name]: projectWithSecondMember
};

export const listFixtures = (): Fixture[] => Object.values(FIXTURES);

export const makeRunId = (): string => crypto.randomBytes(4).toString("hex");

/**
 * Logs the bootstrapped admin in and scopes the token to the organization, which is the
 * same two-call sequence createBrowserSession uses. Org scoping is required: the token from
 * login carries no organizationId and project routes reject it.
 */
export const resolveAdminToken = async (state: InstanceState): Promise<string> => {
  const api = new InfisicalApi(state.baseUrl);
  const login = await api.login(state.adminEmail, state.adminPassword);
  const scoped = await api.selectOrganization(login.accessToken, state.organizationId);
  return scoped.token;
};

export const setupFixture = async (
  name: string,
  state: InstanceState,
  runId = makeRunId(),
  token?: string
): Promise<FixtureResult> => {
  const fixture = FIXTURES[name];
  if (!fixture) {
    throw new Error(
      `Unknown fixture "${name}". Registered: ${Object.keys(FIXTURES).sort().join(", ")}`
    );
  }

  return fixture.setup({
    api: new InfisicalApi(state.baseUrl),
    state,
    token: token ?? (await resolveAdminToken(state)),
    runId
  });
};
