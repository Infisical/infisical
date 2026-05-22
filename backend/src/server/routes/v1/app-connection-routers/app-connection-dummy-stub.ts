// Stub layer for seeded "dummy" app connections used by the secret-sync form-flow
// test seed (backend/src/db/seeds/6-app-connections.ts).
//
// The seed inserts one app connection per provider with an ID of the form
// 00000000-0000-0000-0000-000000000NNN. This Fastify preHandler hook recognises
// requests against those IDs and short-circuits the provider-specific list-resource
// endpoints (e.g. GET /:connectionId/repositories) with canned fixtures, so the
// secret-sync destination-config dropdowns populate without any real provider API call.
//
// Real (non-dummy) connections pass through untouched.

export const DUMMY_CONNECTION_ID_PREFIX = "00000000-0000-0000-0000-";

const isDummyConnectionId = (id: string): boolean => id.startsWith(DUMMY_CONNECTION_ID_PREFIX);

// Fixtures keyed by URL prefix (the AppConnection enum's string value, e.g. "github", "aws")
// then by route pattern relative to /:connectionId/. Patterns may include `:param`
// placeholders, which match any non-slash segment when looking up.
//
// Response shapes mirror each provider's route response schema in
// backend/src/server/routes/v1/app-connection-routers/<provider>-connection-router.ts.
// If a provider router's schema is updated, the corresponding fixture needs an update too.
const STUB_FIXTURES: Record<string, Record<string, unknown>> = {
  aws: {
    "kms-keys": {
      kmsKeys: [
        { alias: "alias/dummy-key-1", id: "dummy-aws-kms-key-1" },
        { alias: "alias/dummy-key-2", id: "dummy-aws-kms-key-2" }
      ]
    },
    users: {
      iamUsers: [
        { UserName: "dummy-user-1", Arn: "arn:aws:iam::123456789012:user/dummy-user-1" },
        { UserName: "dummy-user-2", Arn: "arn:aws:iam::123456789012:user/dummy-user-2" }
      ]
    }
  },

  github: {
    repositories: {
      repositories: [
        { id: 1, name: "dummy-repo-1", owner: { login: "dummy-owner", id: 1 } },
        { id: 2, name: "dummy-repo-2", owner: { login: "dummy-owner", id: 1 } }
      ]
    },
    organizations: {
      organizations: [
        { id: 1, login: "dummy-org-1" },
        { id: 2, login: "dummy-org-2" }
      ]
    },
    environments: {
      environments: [
        { id: 1, name: "production" },
        { id: 2, name: "staging" }
      ]
    }
  },

  gcp: {
    "secret-manager-projects": [
      { id: "dummy-gcp-project-1", name: "Dummy GCP Project 1" },
      { id: "dummy-gcp-project-2", name: "Dummy GCP Project 2" }
    ],
    "secret-manager-project-locations": [
      { displayName: "us-central1 (Iowa)", locationId: "us-central1" },
      { displayName: "us-east1 (South Carolina)", locationId: "us-east1" }
    ]
  },

  "azure-devops": {
    projects: {
      projects: [
        { name: "Dummy Azure DevOps Project 1", id: "dummy-azdo-project-1", appId: "dummy-app-1" },
        { name: "Dummy Azure DevOps Project 2", id: "dummy-azdo-project-2", appId: "dummy-app-2" }
      ]
    }
  },

  "azure-entra-id": {
    "scim-service-principals": {
      servicePrincipals: [
        { id: "dummy-sp-1", displayName: "Dummy Service Principal 1", appId: "dummy-app-1" },
        { id: "dummy-sp-2", displayName: "Dummy Service Principal 2", appId: "dummy-app-2" }
      ]
    }
  },

  databricks: {
    "secret-scopes": {
      secretScopes: [{ name: "dummy-scope-1" }, { name: "dummy-scope-2" }]
    },
    "service-principals": {
      servicePrincipals: [
        { id: "dummy-sp-1", name: "Dummy SP 1", clientId: "dummy-client-1" },
        { id: "dummy-sp-2", name: "Dummy SP 2", clientId: "dummy-client-2" }
      ]
    }
  },

  humanitec: {
    organizations: [
      {
        id: "dummy-humanitec-org",
        name: "Dummy Humanitec Org",
        apps: [
          {
            id: "dummy-app-1",
            name: "Dummy App 1",
            envs: [
              { id: "dev", name: "Development" },
              { id: "prod", name: "Production" }
            ]
          }
        ]
      }
    ]
  },

  "terraform-cloud": {
    organizations: [
      {
        id: "dummy-tfc-org",
        name: "dummy-tfc-org",
        variableSets: [{ id: "dummy-varset-1", name: "Dummy Variable Set 1", description: "Stub", global: false }],
        workspaces: [
          { id: "dummy-workspace-1", name: "dummy-workspace-1" },
          { id: "dummy-workspace-2", name: "dummy-workspace-2" }
        ]
      }
    ]
  },

  camunda: {
    clusters: {
      clusters: [
        { uuid: "dummy-camunda-cluster-1", name: "Dummy Cluster 1" },
        { uuid: "dummy-camunda-cluster-2", name: "Dummy Cluster 2" }
      ]
    }
  },

  vercel: {
    projects: [
      {
        id: "dummy-vercel-project-1",
        name: "Dummy Vercel Project 1",
        slug: "dummy-vercel-project-1",
        apps: [
          {
            id: "dummy-app-1",
            name: "dummy-app-1",
            envs: [
              {
                id: "dummy-env-1",
                slug: "production",
                type: "production",
                target: ["production"],
                description: "Production env",
                createdAt: 1700000000000,
                updatedAt: 1700000000000
              }
            ],
            previewBranches: ["main", "staging"]
          }
        ]
      }
    ]
  },

  windmill: {
    workspaces: [
      { id: "dummy-workspace-1", name: "Dummy Workspace 1" },
      { id: "dummy-workspace-2", name: "Dummy Workspace 2" }
    ]
  },

  "hashicorp-vault": {
    mounts: ["dummy-mount-1/", "dummy-mount-2/"]
  },

  teamcity: {
    projects: [
      {
        id: "dummy-tc-project-1",
        name: "Dummy TeamCity Project 1",
        buildTypes: {
          buildType: [
            { id: "dummy-bt-1", name: "Dummy Build Type 1" },
            { id: "dummy-bt-2", name: "Dummy Build Type 2" }
          ]
        }
      }
    ]
  },

  oci: {
    compartments: [
      { id: "ocid1.compartment.oc1..dummy1", name: "Dummy Compartment 1" },
      { id: "ocid1.compartment.oc1..dummy2", name: "Dummy Compartment 2" }
    ],
    vaults: [
      { id: "ocid1.vault.oc1..dummy1", displayName: "Dummy Vault 1" },
      { id: "ocid1.vault.oc1..dummy2", displayName: "Dummy Vault 2" }
    ],
    "vault-keys": [
      { id: "ocid1.key.oc1..dummy1", displayName: "Dummy Key 1" },
      { id: "ocid1.key.oc1..dummy2", displayName: "Dummy Key 2" }
    ]
  },

  "1password": {
    vaults: [
      {
        id: "dummy-1p-vault-1",
        name: "Dummy 1P Vault 1",
        type: "USER_CREATED",
        items: 5,
        attributeVersion: 1,
        contentVersion: 1,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z"
      },
      {
        id: "dummy-1p-vault-2",
        name: "Dummy 1P Vault 2",
        type: "USER_CREATED",
        items: 3,
        attributeVersion: 1,
        contentVersion: 1,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z"
      }
    ]
  },

  heroku: {
    apps: [
      { id: "dummy-heroku-app-1", name: "dummy-heroku-app-1" },
      { id: "dummy-heroku-app-2", name: "dummy-heroku-app-2" }
    ]
  },

  render: {
    services: [
      { id: "dummy-render-svc-1", name: "Dummy Render Service 1" },
      { id: "dummy-render-svc-2", name: "Dummy Render Service 2" }
    ],
    "environment-groups": [
      { id: "dummy-render-envgroup-1", name: "Dummy Env Group 1" },
      { id: "dummy-render-envgroup-2", name: "Dummy Env Group 2" }
    ]
  },

  flyio: {
    apps: [
      { id: "dummy-flyio-app-1", name: "dummy-flyio-app-1" },
      { id: "dummy-flyio-app-2", name: "dummy-flyio-app-2" }
    ]
  },

  gitlab: {
    projects: [
      { id: "1001", name: "Dummy GitLab Project 1" },
      { id: "1002", name: "Dummy GitLab Project 2" }
    ],
    groups: [
      { id: "2001", fullName: "dummy-group-1" },
      { id: "2002", fullName: "dummy-group-2" }
    ]
  },

  cloudflare: {
    "cloudflare-pages-projects": [
      { id: "dummy-cf-pages-1", name: "Dummy Pages Project 1" },
      { id: "dummy-cf-pages-2", name: "Dummy Pages Project 2" }
    ],
    "cloudflare-workers-scripts": [{ id: "dummy-cf-worker-1" }, { id: "dummy-cf-worker-2" }],
    "cloudflare-zones": [
      { id: "dummy-cf-zone-1", name: "dummy-zone-1.example.com" },
      { id: "dummy-cf-zone-2", name: "dummy-zone-2.example.com" }
    ]
  },

  supabase: {
    projects: {
      projects: [
        { name: "Dummy Supabase Project 1", id: "dummy-sb-project-1" },
        { name: "Dummy Supabase Project 2", id: "dummy-sb-project-2" }
      ]
    }
  },

  zabbix: {
    hosts: [
      { hostId: "10001", host: "dummy-zabbix-host-1" },
      { hostId: "10002", host: "dummy-zabbix-host-2" }
    ]
  },

  railway: {
    projects: {
      projects: [
        {
          name: "Dummy Railway Project 1",
          id: "dummy-rw-project-1",
          services: [
            { name: "dummy-service-1", id: "dummy-rw-svc-1" },
            { name: "dummy-service-2", id: "dummy-rw-svc-2" }
          ],
          environments: [
            { name: "production", id: "dummy-rw-env-prod" },
            { name: "staging", id: "dummy-rw-env-staging" }
          ]
        }
      ]
    }
  },

  checkly: {
    accounts: {
      accounts: [
        { name: "Dummy Checkly Account 1", id: "dummy-checkly-acc-1", runtimeId: "2024.02" },
        { name: "Dummy Checkly Account 2", id: "dummy-checkly-acc-2", runtimeId: "2024.02" }
      ]
    },
    "accounts/:accountId/groups": {
      groups: [
        { name: "Dummy Group 1", id: "dummy-checkly-group-1" },
        { name: "Dummy Group 2", id: "dummy-checkly-group-2" }
      ]
    }
  },

  "digital-ocean": {
    apps: {
      apps: [
        { id: "dummy-do-app-1", spec: { name: "Dummy DO App 1" } },
        { id: "dummy-do-app-2", spec: { name: "Dummy DO App 2" } }
      ]
    }
  },

  netlify: {
    accounts: {
      accounts: [
        { name: "Dummy Netlify Account 1", id: "dummy-netlify-acc-1" },
        { name: "Dummy Netlify Account 2", id: "dummy-netlify-acc-2" }
      ]
    },
    "accounts/:accountId/sites": {
      sites: [
        { name: "dummy-netlify-site-1", id: "dummy-netlify-site-1" },
        { name: "dummy-netlify-site-2", id: "dummy-netlify-site-2" }
      ]
    }
  },

  northflank: {
    projects: {
      projects: [
        { name: "Dummy Northflank Project 1", id: "dummy-nf-project-1" },
        { name: "Dummy Northflank Project 2", id: "dummy-nf-project-2" }
      ]
    },
    "projects/:projectId/secret-groups": {
      secretGroups: [
        { name: "dummy-secret-group-1", id: "dummy-nf-sg-1" },
        { name: "dummy-secret-group-2", id: "dummy-nf-sg-2" }
      ]
    }
  },

  bitbucket: {
    workspaces: {
      workspaces: [{ slug: "dummy-bb-workspace-1" }, { slug: "dummy-bb-workspace-2" }]
    },
    repositories: {
      repositories: [
        { slug: "dummy-bb-repo-1", full_name: "dummy-bb-workspace-1/dummy-bb-repo-1", uuid: "{dummy-bb-uuid-1}" },
        { slug: "dummy-bb-repo-2", full_name: "dummy-bb-workspace-1/dummy-bb-repo-2", uuid: "{dummy-bb-uuid-2}" }
      ]
    },
    environments: {
      environments: [
        { slug: "production", name: "Production", uuid: "{dummy-bb-env-prod}" },
        { slug: "staging", name: "Staging", uuid: "{dummy-bb-env-staging}" }
      ]
    }
  },

  "laravel-forge": {
    organizations: [
      { id: "1", name: "Dummy Forge Org 1", slug: "dummy-forge-org-1" },
      { id: "2", name: "Dummy Forge Org 2", slug: "dummy-forge-org-2" }
    ],
    servers: [
      { id: "101", name: "dummy-forge-server-1" },
      { id: "102", name: "dummy-forge-server-2" }
    ],
    sites: [
      { id: "1001", name: "dummy-forge-site-1.example.com" },
      { id: "1002", name: "dummy-forge-site-2.example.com" }
    ]
  },

  chef: {
    "data-bags": [{ name: "dummy-data-bag-1" }, { name: "dummy-data-bag-2" }],
    "data-bag-items": [{ name: "dummy-item-1" }, { name: "dummy-item-2" }]
  },

  "octopus-deploy": {
    spaces: [
      { id: "Spaces-1", name: "Default Space", slug: "default", isDefault: true },
      { id: "Spaces-2", name: "Secondary Space", slug: "secondary", isDefault: false }
    ],
    projects: [
      { id: "Projects-1", name: "Dummy Octopus Project 1", slug: "dummy-octopus-project-1" },
      { id: "Projects-2", name: "Dummy Octopus Project 2", slug: "dummy-octopus-project-2" }
    ],
    "scope-values": {
      environments: [
        { id: "Environments-1", name: "Production" },
        { id: "Environments-2", name: "Staging" }
      ],
      roles: [{ id: "Roles-1", name: "web-server" }],
      machines: [{ id: "Machines-1", name: "dummy-machine-1" }],
      processes: [{ id: "Processes-1", name: "dummy-process-1" }],
      actions: [{ id: "Actions-1", name: "Deploy Web App" }],
      channels: [{ id: "Channels-1", name: "default" }]
    }
  },

  circleci: {
    projects: {
      organizations: [
        {
          name: "dummy-circleci-org",
          projects: [
            { name: "dummy-circleci-project-1", id: "dummy-cci-project-1" },
            { name: "dummy-circleci-project-2", id: "dummy-cci-project-2" }
          ]
        }
      ]
    }
  },

  "external-infisical": {
    projects: {
      projects: [
        {
          id: "dummy-extinf-project-1",
          name: "Dummy External Infisical Project 1",
          slug: "dummy-extinf-project-1",
          environments: [
            { id: "dummy-extinf-env-dev", name: "Development", slug: "dev" },
            { id: "dummy-extinf-env-prod", name: "Production", slug: "prod" }
          ]
        }
      ]
    },
    "projects/:projectId/environment-folder-tree": {
      dev: {
        id: "dummy-extinf-env-dev",
        name: "Development",
        slug: "dev",
        folders: [{ id: "dummy-folder-1", name: "Root", path: "/" }]
      },
      prod: {
        id: "dummy-extinf-env-prod",
        name: "Production",
        slug: "prod",
        folders: [{ id: "dummy-folder-2", name: "Root", path: "/" }]
      }
    }
  },

  ona: {
    projects: [
      { id: "dummy-ona-project-1", name: "Dummy Ona Project 1" },
      { id: "dummy-ona-project-2", name: "Dummy Ona Project 2" }
    ]
  },

  "travis-ci": {
    repositories: [
      { id: "100001", name: "dummy-repo-1", slug: "dummy-owner/dummy-repo-1" },
      { id: "100002", name: "dummy-repo-2", slug: "dummy-owner/dummy-repo-2" }
    ],
    branches: [
      { name: "main", isDefault: true },
      { name: "staging", isDefault: false }
    ]
  },

  snowflake: {
    databases: { databases: [{ name: "DUMMY_DB_1" }, { name: "DUMMY_DB_2" }] },
    schemas: { schemas: [{ name: "PUBLIC" }, { name: "ANALYTICS" }] }
  }
};

const matchStubRoute = (app: string, resourcePath: string): unknown => {
  const routes = STUB_FIXTURES[app];
  if (!routes) return undefined;

  if (resourcePath in routes) return routes[resourcePath];

  const dynamicEntry = Object.entries(routes).find(([pattern]) => {
    if (!pattern.includes(":")) return false;
    return new RegExp(`^${pattern.replace(/:[^/]+/g, "[^/]+")}$`).test(resourcePath);
  });

  return dynamicEntry?.[1];
};

const APP_CONNECTION_URL_RE = /^\/api\/v1\/app-connections\/([^/]+)\/([^/?]+)\/(.+?)\/?$/;

type FastifyServerLike = {
  addHook: (
    name: "preHandler",
    fn: (req: { url: string; method: string }, reply: { send: (body: unknown) => unknown }) => unknown
  ) => unknown;
};

export const registerDummyConnectionStubHook = (server: FastifyServerLike) => {
  server.addHook("preHandler", async (req, reply) => {
    if (req.method !== "GET") return;

    const path = req.url.split("?")[0];
    const match = path.match(APP_CONNECTION_URL_RE);
    if (!match) return;

    const [, app, connectionId, resourcePath] = match;
    if (!isDummyConnectionId(connectionId)) return;

    const stub = matchStubRoute(app, resourcePath);
    if (stub === undefined) return;

    return reply.send(stub);
  });
};
