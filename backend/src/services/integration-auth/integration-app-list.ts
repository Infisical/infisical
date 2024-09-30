/* eslint-disable no-await-in-loop */
import { Octokit } from "@octokit/rest";

import { request } from "@app/lib/config/request";
import { NotFoundError } from "@app/lib/errors";

import { Integrations, IntegrationUrls } from "./integration-list";

// akhilmhdh: check this part later. Copied from old base
// There are couple of improvements to be done from here

type App = {
  name: string;
  appId?: string;
  owner?: string;
};

/**
 * Return list of apps for GCP secret manager integration
 */
const getAppsGCPSecretManager = async ({ accessToken }: { accessToken: string }) => {
  interface GCPApp {
    projectNumber: string;
    projectId: string;
    lifecycleState: "ACTIVE" | "LIFECYCLE_STATE_UNSPECIFIED" | "DELETE_REQUESTED" | "DELETE_IN_PROGRESS";
    name: string;
    createTime: string;
    parent: {
      type: "organization" | "folder" | "project";
      id: string;
    };
  }

  interface GCPGetProjectsRes {
    projects: GCPApp[];
    nextPageToken?: string;
  }

  interface GCPGetServiceRes {
    name: string;
    parent: string;
    state: "ENABLED" | "DISABLED" | "STATE_UNSPECIFIED";
  }

  let gcpApps: GCPApp[] = [];
  const apps: App[] = [];

  const pageSize = 100;
  let pageToken: string | undefined;
  let hasMorePages = true;

  while (hasMorePages) {
    const params = new URLSearchParams({
      pageSize: String(pageSize),
      ...(pageToken ? { pageToken } : {})
    });

    const res = (
      await request.get<GCPGetProjectsRes>(`${IntegrationUrls.GCP_API_URL}/v1/projects`, {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      })
    ).data;

    gcpApps = gcpApps.concat(res.projects);

    if (!res.nextPageToken) {
      hasMorePages = false;
    }

    pageToken = res.nextPageToken;
  }

  // eslint-disable-next-line
  for await (const gcpApp of gcpApps) {
    try {
      const res = (
        await request.get<GCPGetServiceRes>(
          `${IntegrationUrls.GCP_SERVICE_USAGE_URL}/v1/projects/${gcpApp.projectId}/services/${IntegrationUrls.GCP_SECRET_MANAGER_SERVICE_NAME}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Accept-Encoding": "application/json"
            }
          }
        )
      ).data;

      if (res.state === "ENABLED") {
        apps.push({
          name: gcpApp.name,
          appId: gcpApp.projectId
        });
      }
    } catch {
      // eslint-disable-next-line
      continue;
    }
  }

  return apps;
};

/**
 * Return list of apps for Heroku integration
 */
const getAppsHeroku = async ({ accessToken }: { accessToken: string }) => {
  const res = (
    await request.get<{ name: string; id: string }[]>(`${IntegrationUrls.HEROKU_API_URL}/apps`, {
      headers: {
        Accept: "application/vnd.heroku+json; version=3",
        Authorization: `Bearer ${accessToken}`
      }
    })
  ).data;

  const apps = res.map((a) => ({
    name: a.name,
    appId: a.id
  }));

  return apps;
};

/**
 * Return list of names of apps for Vercel integration
 */
const getAppsVercel = async ({ accessToken, teamId }: { teamId?: string | null; accessToken: string }) => {
  const apps: Array<{ name: string; appId: string }> = [];

  const limit = "20";
  let hasMorePages = true;
  let next: number | null = null;

  interface Response {
    projects: { name: string; id: string }[];
    pagination: {
      count: number;
      next: number | null;
      prev: number;
    };
  }

  while (hasMorePages) {
    const params: { [key: string]: string } = {
      limit
    };

    if (teamId) {
      params.teamId = teamId;
    }

    if (next) {
      params.until = String(next);
    }

    const { data } = await request.get<Response>(`${IntegrationUrls.VERCEL_API_URL}/v9/projects`, {
      params: new URLSearchParams(params),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    });

    data.projects.forEach((a) => {
      apps.push({
        name: a.name,
        appId: a.id
      });
    });

    next = data.pagination.next;

    if (data.pagination.next === null) {
      hasMorePages = false;
    }
  }

  return apps;
};

/**
 * Return list of sites for Netlify integration
 */
const getAppsNetlify = async ({ accessToken }: { accessToken: string }) => {
  const apps: Array<{ name: string; appId: string }> = [];
  let page = 1;
  const perPage = 10;
  let hasMorePages = true;

  // paginate through all sites
  while (hasMorePages) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      filter: "all"
    });

    const { data } = await request.get<{ name: string; site_id: string }[]>(
      `${IntegrationUrls.NETLIFY_API_URL}/api/v1/sites`,
      {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );

    data.forEach((a) => {
      apps.push({
        name: a.name,
        appId: a.site_id
      });
    });

    if (data.length < perPage) {
      hasMorePages = false;
    }

    page += 1;
  }

  return apps;
};

/**
 * Return list of repositories for Github integration
 */
const getAppsGithub = async ({ accessToken }: { accessToken: string }) => {
  interface GitHubApp {
    id: string;
    name: string;
    permissions: {
      admin: boolean;
    };
    owner: {
      login: string;
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const repos = (await new Octokit({
    auth: accessToken
  }).paginate("GET /user/repos{?visibility,affiliation,type,sort,direction,per_page,page,since,before}", {
    per_page: 100
  })) as GitHubApp[];

  const apps = repos
    .filter((a: GitHubApp) => a.permissions.admin === true)
    .map((a: GitHubApp) => ({
      appId: a.id,
      name: a.name,
      owner: a.owner.login
    }));

  return apps;
};

/**
 * Return list of services for Render integration
 */
const getAppsRender = async ({ accessToken }: { accessToken: string }) => {
  const apps: Array<{ name: string; appId: string }> = [];
  let hasMorePages = true;
  const perPage = 100;
  let cursor;

  interface RenderService {
    cursor: string;
    service: { name: string; id: string };
  }

  while (hasMorePages) {
    const res: RenderService[] = (
      await request.get<RenderService[]>(`${IntegrationUrls.RENDER_API_URL}/v1/services`, {
        params: new URLSearchParams({
          ...(cursor ? { cursor: String(cursor) } : {}),
          limit: String(perPage)
        }),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Accept-Encoding": "application/json"
        }
      })
    ).data;

    res.forEach((a) => {
      apps.push({
        name: a.service.name,
        appId: a.service.id
      });
    });

    if (res.length < perPage) {
      hasMorePages = false;
    } else {
      cursor = res[res.length - 1].cursor;
    }
  }

  return apps;
};

/**
 * Return list of projects for Railway integration
 */
const getAppsRailway = async ({ accessToken }: { accessToken: string }) => {
  const query = `
    query GetProjects($userId: String, $teamId: String) {
      projects(userId: $userId, teamId: $teamId) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;

  const variables = {};

  const {
    data: {
      data: {
        projects: { edges }
      }
    }
  } = await request.post<{
    data: { projects: { edges: { node: { name: string; id: string } }[] } };
  }>(
    IntegrationUrls.RAILWAY_API_URL,
    {
      query,
      variables
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept-Encoding": "application/json"
      }
    }
  );

  const apps = edges.map((e) => ({
    name: e.node.name,
    appId: e.node.id
  }));

  return apps;
};

/**
 * Return list of sites for Laravel Forge integration
 */
const getAppsLaravelForge = async ({ accessToken, serverId }: { accessToken: string; serverId?: string }) => {
  const res = (
    await request.get<{ sites: { name: string; id: string }[] }>(
      `${IntegrationUrls.LARAVELFORGE_API_URL}/api/v1/servers/${serverId}/sites`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    )
  ).data.sites;

  const apps = res.map((a) => ({
    name: a.name,
    appId: a.id
  }));

  return apps;
};

/**
 * Return list of apps for Fly.io integration
 */
const getAppsFlyio = async ({ accessToken }: { accessToken: string }) => {
  interface FlyioApp {
    id: string;
    name: string;
    hostname: string;
  }

  const query = `
    query($role: String) {
      apps(type: "container", first: 400, role: $role) {
        nodes {
          id
          name
          hostname
        }
      }
    }
  `;

  const res = (
    await request.post<{ data: { apps: { nodes: FlyioApp[] } } }>(
      IntegrationUrls.FLYIO_API_URL,
      {
        query,
        variables: {
          role: null
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data.data.apps.nodes;

  const apps = res.map((a) => ({
    name: a.name,
    appId: a.id
  }));

  return apps;
};

/**
 * Return list of projects for CircleCI integration
 */
const getAppsCircleCI = async ({ accessToken }: { accessToken: string }) => {
  const res = (
    await request.get<{ reponame: string; username: string; vcs_url: string }[]>(
      `${IntegrationUrls.CIRCLECI_API_URL}/v1.1/projects`,
      {
        headers: {
          "Circle-Token": accessToken,
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data;

  const apps = res.map((a) => ({
    owner: a.username, // username maps to unique organization name in CircleCI
    name: a.reponame, // reponame maps to project name within an organization in CircleCI
    appId: a.vcs_url.split("/").pop() // vcs_url maps to the project id in CircleCI
  }));

  return apps;
};

const getAppsTravisCI = async ({ accessToken }: { accessToken: string }) => {
  const res = (
    await request.get<{ id: string; slug: string }[]>(`${IntegrationUrls.TRAVISCI_API_URL}/repos`, {
      headers: {
        Authorization: `token ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    })
  ).data;

  const apps = res?.map((a) => ({
    name: a?.slug?.split("/")[1],
    appId: a?.id
  }));

  return apps;
};

/**
 * Return list of projects for Terraform Cloud integration
 */
const getAppsTerraformCloud = async ({ accessToken, workspacesId }: { accessToken: string; workspacesId?: string }) => {
  const res = (
    await request.get<{ data: { attributes: { name: string }; id: string } }>(
      `${IntegrationUrls.TERRAFORM_CLOUD_API_URL}/api/v2/workspaces/${workspacesId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    )
  ).data.data;

  const apps = [];

  const appsObj = {
    name: res?.attributes.name,
    appId: res?.id
  };

  apps.push(appsObj);

  return apps;
};

/**
 * Return list of repositories for GitLab integration
 */
const getAppsGitlab = async ({
  url,
  accessToken,
  teamId
}: {
  accessToken: string;
  teamId?: string | null;
  url?: string | null;
}) => {
  const gitLabApiUrl = url ? `${url}/api` : IntegrationUrls.GITLAB_API_URL;

  const apps: App[] = [];

  let page = 1;
  const perPage = 10;
  let hasMorePages = true;

  if (teamId) {
    // case: fetch projects for group with id [teamId] in GitLab

    while (hasMorePages) {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage)
      });

      const { data } = await request.get<{ name: string; id: string }[]>(
        `${gitLabApiUrl}/v4/groups/${teamId}/projects`,
        {
          params,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );

      data.forEach((a) => {
        apps.push({
          name: a.name,
          appId: a.id
        });
      });

      if (data.length < perPage) {
        hasMorePages = false;
      }

      page += 1;
    }
  } else {
    // case: fetch projects for individual in GitLab

    const { id } = (
      await request.get<{ id: string }>(`${gitLabApiUrl}/v4/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      })
    ).data;

    while (hasMorePages) {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage)
      });

      const { data } = await request.get<{ name: string; id: string }[]>(`${gitLabApiUrl}/v4/users/${id}/projects`, {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      });

      data.forEach((a) => {
        apps.push({
          name: a.name,
          appId: a.id
        });
      });

      if (data.length < perPage) {
        hasMorePages = false;
      }

      page += 1;
    }
  }

  return apps;
};

/**
 * Return list of projects for TeamCity integration
 */
const getAppsTeamCity = async ({ accessToken, url }: { url: string; accessToken: string }) => {
  const res = (
    await request.get<{ project: { name: string; id: string }[] }>(`${url}/app/rest/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    })
  ).data.project.slice(1);

  const apps = res.map((a) => ({
    name: a.name,
    appId: a.id
  }));

  return apps;
};

/**
 * Return list of projects for Supabase integration
 */
const getAppsSupabase = async ({ accessToken }: { accessToken: string }) => {
  const { data } = await request.get<{ name: string; id: string }[]>(
    `${IntegrationUrls.SUPABASE_API_URL}/v1/projects`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  const apps = data.map((a) => ({
    name: a.name,
    appId: a.id
  }));

  return apps;
};

/**
 * Return list of accounts for the Checkly integration
 */
const getAppsCheckly = async ({ accessToken }: { accessToken: string }) => {
  const { data } = await request.get<{ name: string; id: string }[]>(`${IntegrationUrls.CHECKLY_API_URL}/v1/accounts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  const apps = data.map((a) => ({
    name: a.name,
    appId: a.id
  }));

  return apps;
};

/**
 * Return list of projects for the Cloudflare Pages integration
 */
const getAppsCloudflarePages = async ({ accessToken, accountId }: { accessToken: string; accountId?: string }) => {
  const { data } = await request.get<{ result: { name: string; id: string }[] }>(
    `${IntegrationUrls.CLOUDFLARE_PAGES_API_URL}/client/v4/accounts/${accountId}/pages/projects`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );

  const apps = data.result.map((a) => ({
    name: a.name,
    appId: a.id
  }));
  return apps;
};

/**
 * Return list of projects for the Cloudflare Workers integration
 */
const getAppsCloudflareWorkers = async ({ accessToken, accountId }: { accessToken: string; accountId?: string }) => {
  const { data } = await request.get<{ result: { id: string }[] }>(
    `${IntegrationUrls.CLOUDFLARE_WORKERS_API_URL}/client/v4/accounts/${accountId}/workers/services`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    }
  );

  const apps = data.result.map((a) => ({
    name: a.id,
    appId: a.id
  }));
  return apps;
};

/**
 * Return list of repositories for the BitBucket integration based on provided BitBucket workspace
 */
const getAppsBitBucket = async ({ accessToken, workspaceSlug }: { accessToken: string; workspaceSlug?: string }) => {
  interface RepositoriesResponse {
    size: number;
    page: number;
    pageLen: number;
    next: string;
    previous: string;
    values: Array<Repository>;
  }

  interface Repository {
    type: string;
    uuid: string;
    name: string;
    is_private: boolean;
    created_on: string;
    updated_on: string;
  }

  if (!workspaceSlug) {
    return [];
  }

  const repositories: Repository[] = [];
  let hasNextPage = true;
  let repositoriesUrl = `${IntegrationUrls.BITBUCKET_API_URL}/2.0/repositories/${workspaceSlug}`;

  while (hasNextPage) {
    const { data }: { data: RepositoriesResponse } = await request.get(repositoriesUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    if (data?.values.length > 0) {
      data.values.forEach((repository) => {
        repositories.push(repository);
      });
    }

    if (data.next) {
      repositoriesUrl = data.next;
    } else {
      hasNextPage = false;
    }
  }

  const apps = repositories.map((repository) => ({
    name: repository.name,
    appId: repository.uuid
  }));
  return apps;
};

/** Return list of projects for Northflank integration
 */
const getAppsNorthflank = async ({ accessToken }: { accessToken: string }) => {
  const {
    data: {
      data: { projects }
    }
  } = await request.get<{ data: { projects: { name: string; id: string }[] } }>(
    `${IntegrationUrls.NORTHFLANK_API_URL}/v1/projects`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  const apps = projects.map((a) => ({
    name: a.name,
    appId: a.id
  }));

  return apps;
};

/**
 * Return list of projects for Supabase integration
 */
const getAppsCodefresh = async ({ accessToken }: { accessToken: string }) => {
  const res = (
    await request.get<{ projects: { projectName: string; id: string }[] }>(
      `${IntegrationUrls.CODEFRESH_API_URL}/projects`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    )
  ).data;

  const apps = res.projects.map((a) => ({
    name: a.projectName,
    appId: a.id
  }));

  return apps;
};

/**
 * Return list of projects for Windmill integration
 */
const getAppsWindmill = async ({ accessToken }: { accessToken: string }) => {
  const { data } = await request.get<{ id: string; name: string }[]>(
    `${IntegrationUrls.WINDMILL_API_URL}/workspaces/list`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    }
  );

  // check for write access of secrets in windmill workspaces
  const writeAccessCheck = data.map(async (app) => {
    try {
      const userPath = "u/user/variable";
      const folderPath = "f/folder/variable";

      const { data: writeUser } = await request.post<object>(
        `${IntegrationUrls.WINDMILL_API_URL}/w/${app.id}/variables/create`,
        {
          path: userPath,
          value: "variable",
          is_secret: true,
          description: "variable description"
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );

      const { data: writeFolder } = await request.post<object>(
        `${IntegrationUrls.WINDMILL_API_URL}/w/${app.id}/variables/create`,
        {
          path: folderPath,
          value: "variable",
          is_secret: true,
          description: "variable description"
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        }
      );

      // is write access is allowed then delete the created secrets from workspace
      if (writeUser && writeFolder) {
        await request.delete(`${IntegrationUrls.WINDMILL_API_URL}/w/${app.id}/variables/delete/${userPath}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        });

        await request.delete(`${IntegrationUrls.WINDMILL_API_URL}/w/${app.id}/variables/delete/${folderPath}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json"
          }
        });

        return app;
      }
      return { error: "cannot write secret" };
    } catch (err) {
      return { error: (err as Error).message };
    }
  });

  const appsWriteResponses = await Promise.all(writeAccessCheck);
  const appsWithWriteAccess = appsWriteResponses.filter((appRes) => !(appRes as { error: string })?.error);

  const apps = (appsWithWriteAccess as { id: string; name: string }[]).map((a) => ({
    name: a.name,
    appId: a.id
  }));

  return apps;
};

/**
 * Return list of applications for DigitalOcean App Platform integration
 */
const getAppsDigitalOceanAppPlatform = async ({ accessToken }: { accessToken: string }) => {
  interface DigitalOceanApp {
    id: string;
    owner_uuid: string;
    spec: Spec;
  }

  interface Spec {
    name: string;
    region: string;
    envs: Env[];
  }

  interface Env {
    key: string;
    value: string;
    scope: string;
  }

  const res = (
    await request.get<{ apps: DigitalOceanApp[] }>(`${IntegrationUrls.DIGITAL_OCEAN_API_URL}/v2/apps`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    })
  ).data;

  return (res.apps ?? []).map((a) => ({
    name: a.spec.name,
    appId: a.id
  }));
};

const getAppsHasuraCloud = async ({ accessToken }: { accessToken: string }) => {
  const res = await request.post<{
    data: { projects: { name: string; tenant: { id: string } }[] };
  }>(
    IntegrationUrls.HASURA_CLOUD_API_URL,
    {
      query: "query MyQuery { projects { name tenant { id } } }"
    },
    {
      headers: {
        Authorization: `pat ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );

  const data = (res?.data?.data?.projects ?? []).map(({ name, tenant: { id: appId } }) => ({
    name,
    appId
  }));
  return data;
};

/**
 * Return list of applications for Cloud66 integration
 */
const getAppsCloud66 = async ({ accessToken }: { accessToken: string }) => {
  interface Cloud66Apps {
    uid: string;
    name: string;
    account_id: number;
    git: string;
    git_branch: string;
    environment: string;
    cloud: string;
    fqdn: string;
    language: string;
    framework: string;
    status: number;
    health: number;
    last_activity: string;
    last_activity_iso: string;
    maintenance_mode: boolean;
    has_loadbalancer: boolean;
    created_at: string;
    updated_at: string;
    deploy_directory: string;
    cloud_status: string;
    backend: string;
    version: string;
    revision: string;
    is_busy: boolean;
    account_name: string;
    is_cluster: boolean;
    is_inside_cluster: boolean;
    cluster_name: string;
    application_address: string;
    configstore_namespace: string;
  }

  const stacks = (
    await request.get<{ response: Cloud66Apps[] }>(`${IntegrationUrls.CLOUD_66_API_URL}/3/stacks`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    })
  ).data.response;

  const apps = stacks.map((app) => ({
    name: app.name,
    appId: app.uid
  }));

  return apps;
};

const getAppsAzureDevOps = async ({ accessToken, orgName }: { accessToken: string; orgName: string }) => {
  const res = (
    await request.get<{ count: number; value: Record<string, string>[] }>(
      `${IntegrationUrls.AZURE_DEVOPS_API_URL}/${orgName}/_apis/projects?api-version=7.2-preview.2`,
      {
        headers: {
          Authorization: `Basic ${accessToken}`
        }
      }
    )
  ).data;
  const apps = res.value.map((a) => ({
    name: a.name,
    appId: a.id
  }));

  return apps;
};

export const getApps = async ({
  integration,
  accessToken,
  accessId,
  teamId,
  azureDevOpsOrgName,
  workspaceSlug,
  url
}: {
  integration: string;
  accessToken: string;
  accessId?: string;
  teamId?: string | null;
  azureDevOpsOrgName?: string | null;
  workspaceSlug?: string;
  url?: string | null;
}): Promise<App[]> => {
  switch (integration as Integrations) {
    case Integrations.GCP_SECRET_MANAGER:
      return getAppsGCPSecretManager({
        accessToken
      });
    case Integrations.AZURE_KEY_VAULT:
      return [];
    case Integrations.AWS_PARAMETER_STORE:
      return [];
    case Integrations.AWS_SECRET_MANAGER:
      return [];
    case Integrations.HEROKU:
      return getAppsHeroku({
        accessToken
      });
    case Integrations.VERCEL:
      return getAppsVercel({
        accessToken,
        teamId
      });

    case Integrations.NETLIFY:
      return getAppsNetlify({
        accessToken
      });

    case Integrations.GITHUB:
      return getAppsGithub({
        accessToken
      });

    case Integrations.GITLAB:
      return getAppsGitlab({
        accessToken,
        teamId,
        url
      });

    case Integrations.RENDER:
      return getAppsRender({
        accessToken
      });

    case Integrations.RAILWAY:
      return getAppsRailway({
        accessToken
      });

    case Integrations.FLYIO:
      return getAppsFlyio({
        accessToken
      });

    case Integrations.CIRCLECI:
      return getAppsCircleCI({
        accessToken
      });

    case Integrations.LARAVELFORGE:
      return getAppsLaravelForge({
        accessToken,
        serverId: accessId
      });

    case Integrations.TERRAFORM_CLOUD:
      return getAppsTerraformCloud({
        accessToken,
        workspacesId: accessId
      });

    case Integrations.TRAVISCI:
      return getAppsTravisCI({
        accessToken
      });

    case Integrations.TEAMCITY:
      return getAppsTeamCity({
        accessToken,
        url: url as string
      });

    case Integrations.SUPABASE:
      return getAppsSupabase({
        accessToken
      });

    case Integrations.CHECKLY:
      return getAppsCheckly({
        accessToken
      });

    case Integrations.CLOUDFLARE_PAGES:
      return getAppsCloudflarePages({
        accessToken,
        accountId: accessId
      });

    case Integrations.CLOUDFLARE_WORKERS:
      return getAppsCloudflareWorkers({
        accessToken,
        accountId: accessId
      });

    case Integrations.NORTHFLANK:
      return getAppsNorthflank({
        accessToken
      });

    case Integrations.BITBUCKET:
      return getAppsBitBucket({
        accessToken,
        workspaceSlug
      });

    case Integrations.CODEFRESH:
      return getAppsCodefresh({
        accessToken
      });

    case Integrations.WINDMILL:
      return getAppsWindmill({
        accessToken
      });

    case Integrations.DIGITAL_OCEAN_APP_PLATFORM:
      return getAppsDigitalOceanAppPlatform({
        accessToken
      });

    case Integrations.CLOUD_66:
      return getAppsCloud66({
        accessToken
      });

    case Integrations.HASURA_CLOUD:
      return getAppsHasuraCloud({
        accessToken
      });

    case Integrations.AZURE_DEVOPS:
      return getAppsAzureDevOps({
        accessToken,
        orgName: azureDevOpsOrgName as string
      });

    default:
      throw new NotFoundError({ message: "integration not found" });
  }
};
