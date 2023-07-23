import {
  INTEGRATION_AWS_PARAMETER_STORE,
  INTEGRATION_AWS_SECRET_MANAGER,
  INTEGRATION_AZURE_KEY_VAULT,
  INTEGRATION_BITBUCKET,
  INTEGRATION_BITBUCKET_API_URL,
  INTEGRATION_CHECKLY,
  INTEGRATION_CHECKLY_API_URL,
  INTEGRATION_CIRCLECI,
  INTEGRATION_CIRCLECI_API_URL,
  INTEGRATION_CLOUDFLARE_PAGES,
  INTEGRATION_CLOUDFLARE_PAGES_API_URL,
  INTEGRATION_CLOUD_66,
  INTEGRATION_CLOUD_66_API_URL,
  INTEGRATION_CODEFRESH,
  INTEGRATION_CODEFRESH_API_URL,
  INTEGRATION_DIGITAL_OCEAN_API_URL,
  INTEGRATION_DIGITAL_OCEAN_APP_PLATFORM,
  INTEGRATION_FLYIO,
  INTEGRATION_FLYIO_API_URL,
  INTEGRATION_GITHUB,
  INTEGRATION_GITLAB,
  INTEGRATION_GITLAB_API_URL,
  INTEGRATION_HEROKU,
  INTEGRATION_HEROKU_API_URL,
  INTEGRATION_LARAVELFORGE,
  INTEGRATION_LARAVELFORGE_API_URL,
  INTEGRATION_NETLIFY,
  INTEGRATION_NETLIFY_API_URL,
  INTEGRATION_RAILWAY,
  INTEGRATION_RAILWAY_API_URL,
  INTEGRATION_RENDER,
  INTEGRATION_RENDER_API_URL,
  INTEGRATION_SUPABASE,
  INTEGRATION_SUPABASE_API_URL,
  INTEGRATION_TRAVISCI,
  INTEGRATION_TRAVISCI_API_URL,
  INTEGRATION_VERCEL,
  INTEGRATION_VERCEL_API_URL
} from "../variables";
import { IIntegrationAuth } from "../models";
import { Octokit } from "@octokit/rest";
import { standardRequest } from "../config/request";

interface App {
  name: string;
  appId?: string;
  owner?: string;
}

/**
 * Return list of names of apps for integration named [integration]
 * @param {Object} obj
 * @param {String} obj.integration - name of integration
 * @param {String} obj.accessToken - access token for integration
 * @param {String} obj.teamId - (optional) id of team for getting integration apps (used for integrations like GitLab)
 * @returns {Object[]} apps - names of integration apps
 * @returns {String} apps.name - name of integration app
 */
const getApps = async ({
  integrationAuth,
  accessToken,
  accessId,
  teamId,
  workspaceSlug,
}: {
  integrationAuth: IIntegrationAuth;
  accessToken: string;
  accessId?: string;
  teamId?: string;
  workspaceSlug?: string;
}) => {
  let apps: App[] = [];
  switch (integrationAuth.integration) {
    case INTEGRATION_AZURE_KEY_VAULT:
      apps = [];
      break;
    case INTEGRATION_AWS_PARAMETER_STORE:
      apps = [];
      break;
    case INTEGRATION_AWS_SECRET_MANAGER:
      apps = [];
      break;
    case INTEGRATION_HEROKU:
      apps = await getAppsHeroku({
        accessToken,
      });
      break;
    case INTEGRATION_VERCEL:
      apps = await getAppsVercel({
        integrationAuth,
        accessToken,
      });
      break;
    case INTEGRATION_NETLIFY:
      apps = await getAppsNetlify({
        accessToken,
      });
      break;
    case INTEGRATION_GITHUB:
      apps = await getAppsGithub({
        accessToken,
      });
      break;
    case INTEGRATION_GITLAB:
      apps = await getAppsGitlab({
        accessToken,
        teamId,
      });
      break;
    case INTEGRATION_RENDER:
      apps = await getAppsRender({
        accessToken,
      });
      break;
    case INTEGRATION_RAILWAY:
      apps = await getAppsRailway({
        accessToken,
      });
      break;
    case INTEGRATION_FLYIO:
      apps = await getAppsFlyio({
        accessToken,
      });
      break;
    case INTEGRATION_CIRCLECI:
      apps = await getAppsCircleCI({
        accessToken,
      });
      break;
    case INTEGRATION_LARAVELFORGE:
      apps = await getAppsLaravelForge({
        accessToken,
        serverId: accessId
      });
      break;
    case INTEGRATION_TRAVISCI:
      apps = await getAppsTravisCI({
        accessToken,
      });
      break;
    case INTEGRATION_SUPABASE:
      apps = await getAppsSupabase({
        accessToken,
      });
      break;
    case INTEGRATION_CHECKLY:
      apps = await getAppsCheckly({
        accessToken,
      });
      break;
    case INTEGRATION_CLOUDFLARE_PAGES:
      apps = await getAppsCloudflarePages({
        accessToken,
        accountId: accessId
      })
      break;
    case INTEGRATION_BITBUCKET:
      apps = await getAppsBitBucket({
        accessToken,
        workspaceSlug
      });
      break;
    case INTEGRATION_CODEFRESH:
      apps = await getAppsCodefresh({
        accessToken,
      });
      break;
    case INTEGRATION_DIGITAL_OCEAN_APP_PLATFORM:
      apps = await getAppsDigitalOceanAppPlatform({ 
        accessToken 
      });
      break;
    case INTEGRATION_CLOUD_66:
      apps = await getAppsCloud66({
        accessToken,
      });
      break;
  }

  return apps;
};

/**
 * Return list of apps for Heroku integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Heroku API
 * @returns {Object[]} apps - names of Heroku apps
 * @returns {String} apps.name - name of Heroku app
 */
const getAppsHeroku = async ({ accessToken }: { accessToken: string }) => {
  const res = (
    await standardRequest.get(`${INTEGRATION_HEROKU_API_URL}/apps`, {
      headers: {
        Accept: "application/vnd.heroku+json; version=3",
        Authorization: `Bearer ${accessToken}`,
      },
    })
  ).data;

  const apps = res.map((a: any) => ({
    name: a.name,
  }));

  return apps;
};

/**
 * Return list of names of apps for Vercel integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Vercel API
 * @returns {Object[]} apps - names of Vercel apps
 * @returns {String} apps.name - name of Vercel app
 */
const getAppsVercel = async ({
  integrationAuth,
  accessToken,
}: {
  integrationAuth: IIntegrationAuth;
  accessToken: string;
}) => {
  const res = (
    await standardRequest.get(`${INTEGRATION_VERCEL_API_URL}/v9/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json",
      },
      ...(integrationAuth?.teamId
        ? {
          params: {
            teamId: integrationAuth.teamId,
          },
        }
        : {}),
    })
  ).data;

  const apps = res.projects.map((a: any) => ({
    name: a.name,
    appId: a.id,
  }));

  return apps;
};

/**
 * Return list of sites for Netlify integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Netlify API
 * @returns {Object[]} apps - names of Netlify sites
 * @returns {String} apps.name - name of Netlify site
 */
const getAppsNetlify = async ({ accessToken }: { accessToken: string }) => {
  const apps: any = [];
  let page = 1;
  const perPage = 10;
  let hasMorePages = true;

  // paginate through all sites
  while (hasMorePages) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      filter: "all",
    });

    const { data } = await standardRequest.get(
      `${INTEGRATION_NETLIFY_API_URL}/api/v1/sites`,
      {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json",
        },
      }
    );

    data.map((a: any) => {
      apps.push({
        name: a.name,
        appId: a.site_id,
      });
    });

    if (data.length < perPage) {
      hasMorePages = false;
    }

    page++;
  }

  return apps;
};

/**
 * Return list of repositories for Github integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Github API
 * @returns {Object[]} apps - names of Github sites
 * @returns {String} apps.name - name of Github site
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

  const octokit = new Octokit({
    auth: accessToken,
  });

  const getAllRepos = async () => {
    let repos: GitHubApp[] = [];
    let page = 1;
    const per_page = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await octokit.request(
        "GET /user/repos{?visibility,affiliation,type,sort,direction,per_page,page,since,before}",
        {
          per_page,
          page,
        }
      );

      if (response.data.length > 0) {
        repos = repos.concat(response.data);
        page++;
      } else {
        hasMore = false;
      }
    }

    return repos;
  };

  const repos = await getAllRepos();

  const apps = repos
    .filter((a: GitHubApp) => a.permissions.admin === true)
    .map((a: GitHubApp) => {
      return {
        appId: a.id,
        name: a.name,
        owner: a.owner.login,
      };
    });

  return apps;
};

/**
 * Return list of services for Render integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Render API
 * @returns {Object[]} apps - names and ids of Render services
 * @returns {String} apps.name - name of Render service
 * @returns {String} apps.appId - id of Render service
 */
const getAppsRender = async ({ accessToken }: { accessToken: string }) => {
  const res = (
    await standardRequest.get(`${INTEGRATION_RENDER_API_URL}/v1/services`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Accept-Encoding": "application/json",
      },
    })
  ).data;

  const apps = res.map((a: any) => ({
    name: a.service.name,
    appId: a.service.id,
  }));

  return apps;
};

/**
 * Return list of projects for Railway integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Railway API
 * @returns {Object[]} apps - names and ids of Railway services
 * @returns {String} apps.name - name of Railway project
 * @returns {String} apps.appId - id of Railway project
 *
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
        projects: { edges },
      },
    },
  } = await standardRequest.post(
    INTEGRATION_RAILWAY_API_URL,
    {
      query,
      variables,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept-Encoding": "application/json",
      },
    }
  );

  const apps = edges.map((e: any) => ({
    name: e.node.name,
    appId: e.node.id,
  }));

  return apps;
};

/**
 * Return list of sites for Laravel Forge integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Laravel Forge API
 * @param {String} obj.serverId - server id of Laravel Forge
 * @returns {Object[]} apps - names and ids of Laravel Forge sites
 * @returns {String} apps.name - name of Laravel Forge sites
 * @returns {String} apps.appId - id of Laravel Forge sites
 */
const getAppsLaravelForge = async ({ 
  accessToken,
  serverId
}: {
  accessToken: string;
  serverId?: string;
}) => {
  const res = (
    await standardRequest.get(`${INTEGRATION_LARAVELFORGE_API_URL}/api/v1/servers/${serverId}/sites`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
  ).data.sites;

  const apps = res.map((a: any) => ({
    name: a.name,
    appId: a.id,
  }));

  return apps;
};

/**
 * Return list of apps for Fly.io integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Fly.io API
 * @returns {Object[]} apps - names and ids of Fly.io apps
 * @returns {String} apps.name - name of Fly.io apps
 */
const getAppsFlyio = async ({ accessToken }: { accessToken: string }) => {
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
    await standardRequest.post(
      INTEGRATION_FLYIO_API_URL,
      {
        query,
        variables: {
          role: null,
        },
      },
      {
        headers: {
          Authorization: "Bearer " + accessToken,
          Accept: "application/json",
          "Accept-Encoding": "application/json",
        },
      }
    )
  ).data.data.apps.nodes;

  const apps = res.map((a: any) => ({
    name: a.name,
  }));

  return apps;
};

/**
 * Return list of projects for CircleCI integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for CircleCI API
 * @returns {Object[]} apps -
 * @returns {String} apps.name - name of CircleCI apps
 */
const getAppsCircleCI = async ({ accessToken }: { accessToken: string }) => {
  const res = (
    await standardRequest.get(`${INTEGRATION_CIRCLECI_API_URL}/v1.1/projects`, {
      headers: {
        "Circle-Token": accessToken,
        "Accept-Encoding": "application/json",
      },
    })
  ).data;

  const apps = res?.map((a: any) => {
    return {
      name: a?.reponame,
    };
  });

  return apps;
};

const getAppsTravisCI = async ({ accessToken }: { accessToken: string }) => {
  const res = (
    await standardRequest.get(`${INTEGRATION_TRAVISCI_API_URL}/repos`, {
      headers: {
        Authorization: `token ${accessToken}`,
        "Accept-Encoding": "application/json",
      },
    })
  ).data;

  const apps = res?.map((a: any) => {
    return {
      name: a?.slug?.split("/")[1],
      appId: a?.id,
    };
  });

  return apps;
};

/**
 * Return list of repositories for GitLab integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for GitLab API
 * @returns {Object[]} apps - names of GitLab sites
 * @returns {String} apps.name - name of GitLab site
 */
const getAppsGitlab = async ({
  accessToken,
  teamId,
}: {
  accessToken: string;
  teamId?: string;
}) => {
  const apps: App[] = [];

  let page = 1;
  const perPage = 10;
  let hasMorePages = true;

  if (teamId) {
    // case: fetch projects for group with id [teamId] in GitLab

    while (hasMorePages) {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      });

      const { data } = await standardRequest.get(
        `${INTEGRATION_GITLAB_API_URL}/v4/groups/${teamId}/projects`,
        {
          params,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json",
          },
        }
      );

      data.map((a: any) => {
        apps.push({
          name: a.name,
          appId: a.id,
        });
      });

      if (data.length < perPage) {
        hasMorePages = false;
      }

      page++;
    }
  } else {
    // case: fetch projects for individual in GitLab

    const { id } = (
      await standardRequest.get(`${INTEGRATION_GITLAB_API_URL}/v4/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json",
        },
      })
    ).data;

    while (hasMorePages) {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      });

      const { data } = await standardRequest.get(
        `${INTEGRATION_GITLAB_API_URL}/v4/users/${id}/projects`,
        {
          params,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Accept-Encoding": "application/json",
          },
        }
      );

      data.map((a: any) => {
        apps.push({
          name: a.name,
          appId: a.id,
        });
      });

      if (data.length < perPage) {
        hasMorePages = false;
      }

      page++;
    }
  }

  return apps;
};

/**
 * Return list of projects for Supabase integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Supabase API
 * @returns {Object[]} apps - names of Supabase apps
 * @returns {String} apps.name - name of Supabase app
 */
const getAppsSupabase = async ({ accessToken }: { accessToken: string }) => {
  const { data } = await standardRequest.get(
    `${INTEGRATION_SUPABASE_API_URL}/v1/projects`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json",
      },
    }
  );

  const apps = data.map((a: any) => {
    return {
      name: a.name,
      appId: a.id,
    };
  });

  return apps;
};

/**
 * Return list of projects for the Checkly integration
 * @param {Object} obj
 * @param {String} obj.accessToken - api key for the Checkly API
 * @returns {Object[]} apps - Сheckly accounts
 * @returns {String} apps.name - name of Checkly account
 */
const getAppsCheckly = async ({ accessToken }: { accessToken: string }) => {
  const { data } = await standardRequest.get(
    `${INTEGRATION_CHECKLY_API_URL}/v1/accounts`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    }
  );

  const apps = data.map((a: any) => {
    return {
      name: a.name,
      appId: a.id,
    };
  });

  return apps;
};

/**
 * Return list of projects for the Cloudflare Pages integration
 * @param {Object} obj
 * @param {String} obj.accessToken - api key for the Cloudflare API
 * @returns {Object[]} apps - Cloudflare Pages projects
 * @returns {String} apps.name - name of Cloudflare Pages project
 */
const getAppsCloudflarePages = async ({
  accessToken,
  accountId
}: {
  accessToken: string;
  accountId?: string;
}) => {
  const { data } = await standardRequest.get(
    `${INTEGRATION_CLOUDFLARE_PAGES_API_URL}/client/v4/accounts/${accountId}/pages/projects`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    }
  );

  const apps = data.result.map((a: any) => {
    return {
      name: a.name,
      appId: a.id,
    };
  });
  return apps;
}

/**
 * Return list of repositories for the BitBucket integration based on provided BitBucket workspace
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for BitBucket API
 * @param {String} obj.workspaceSlug - Workspace identifier for fetching BitBucket repositories
 * @returns {Object[]} apps - BitBucket repositories
 * @returns {String} apps.name - name of BitBucket repository
 */
const getAppsBitBucket = async ({ 
  accessToken,
  workspaceSlug,
}: {
  accessToken: string;
  workspaceSlug?: string;
}) => {
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
    return []
  }
  
  const repositories: Repository[] = [];
  let hasNextPage = true;
  let repositoriesUrl = `${INTEGRATION_BITBUCKET_API_URL}/2.0/repositories/${workspaceSlug}`

  while (hasNextPage) {
    const { data }: { data: RepositoriesResponse } = await standardRequest.get(
        repositoriesUrl,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Accept": "application/json",
            },
        }
    );

    if (data?.values.length > 0) {
      data.values.forEach((repository) => {
        repositories.push(repository)
      })
    }

    if (data.next) {
      repositoriesUrl = data.next
    } else {
      hasNextPage = false
    }
  }

  const apps = repositories.map((repository) => {
      return {
          name: repository.name,
          appId: repository.uuid,
      };
  });
  return apps;
}

/**
 * Return list of projects for Supabase integration
 * @param {Object} obj
 * @param {String} obj.accessToken - access token for Supabase API
 * @returns {Object[]} apps - names of Supabase apps
 * @returns {String} apps.name - name of Supabase app
 */
const getAppsCodefresh = async ({
  accessToken,
}: {
  accessToken: string;
}) => {
  const res = (
    await standardRequest.get(`${INTEGRATION_CODEFRESH_API_URL}/projects`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json",
      },
    })
  ).data;

  const apps = res.projects.map((a: any) => ({
    name: a.projectName,
    appId: a.id,
  }));

  return apps;

};

/**
 * Return list of applications for DigitalOcean App Platform integration
 * @param {Object} obj
 * @param {String} obj.accessToken - personal access token for DigitalOcean
 * @returns {Object[]} apps - names of DigitalOcean apps
 * @returns {String} apps.name - name of DigitalOcean app
 * @returns {String} apps.appId - id of DigitalOcean app
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
    await standardRequest.get(`${INTEGRATION_DIGITAL_OCEAN_API_URL}/v2/apps`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    })
  ).data;

  return (res.apps ?? []).map((a: DigitalOceanApp) => ({
    name: a.spec.name,
    appId: a.id
  }));
}
  
/**
 * Return list of applications for Cloud66 integration
 * @param {Object} obj
 * @param {String} obj.accessToken - personal access token for Cloud66 API
 * @returns {Object[]} apps - Cloud66 apps
 * @returns {String} apps.name - name of Cloud66 app
 * @returns {String} apps.appId - uid of Cloud66 app
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
    cluster_name: any;
    application_address: string;
    configstore_namespace: string;
  }

  const stacks = (
    await standardRequest.get(`${INTEGRATION_CLOUD_66_API_URL}/3/stacks`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    })
  ).data.response as Cloud66Apps[]

  const apps = stacks.map((app) => ({
    name: app.name,
    appId: app.uid
  }));

  return apps;
};

export { getApps };
