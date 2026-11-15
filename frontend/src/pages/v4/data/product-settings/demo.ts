import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  HoneyTokenConfigStatus,
  HoneyTokenType,
  type THoneyTokenConfig
} from "@app/hooks/api/honeyToken";
import { ProjectType } from "@app/hooks/api/projects/types";
import type { TProjectTemplate } from "@app/hooks/api/projectTemplates";
import type { TProjectPermission } from "@app/hooks/api/roles/types";

import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type {
  ProductSettingsAdapter,
  TemplateOrgGroup,
  TemplateOrgIdentity,
  TemplateOrgUser
} from "./contract";

const day = 24 * 3600 * 1000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
const ok = <T>(data: T) => ({ data, isPending: false, error: null });

const allow = (subject: string, ...action: string[]): TProjectPermission => ({ subject, action });

const SECRET_SUBJECTS = ["secrets", "secret-folders", "secret-imports", "dynamic-secrets"];

const builtInRoles: TProjectTemplate["roles"] = [
  {
    slug: "admin",
    name: "Admin",
    permissions: [
      ...SECRET_SUBJECTS.map((subject) => allow(subject, "read", "create", "edit", "delete")),
      allow("member", "read", "create", "edit", "delete"),
      allow("role", "read", "create", "edit", "delete"),
      allow("settings", "read", "edit", "delete"),
      allow("environments", "read", "create", "edit", "delete")
    ]
  },
  {
    slug: "member",
    name: "Developer",
    permissions: [
      ...SECRET_SUBJECTS.map((subject) => allow(subject, "read", "create", "edit", "delete")),
      allow("member", "read"),
      allow("environments", "read")
    ]
  },
  {
    slug: "viewer",
    name: "Viewer",
    permissions: [
      ...SECRET_SUBJECTS.map((subject) => allow(subject, "read")),
      allow("member", "read")
    ]
  },
  { slug: "no-access", name: "No Access", permissions: [] }
];

const kmsBuiltInRoles: TProjectTemplate["roles"] = [
  {
    slug: "admin",
    name: "Admin",
    permissions: [
      allow("cmek", "read", "create", "edit", "delete", "encrypt", "decrypt"),
      allow("member", "read", "create", "edit", "delete"),
      allow("role", "read", "create", "edit", "delete")
    ]
  },
  {
    slug: "member",
    name: "Developer",
    permissions: [allow("cmek", "read", "encrypt", "decrypt"), allow("member", "read")]
  },
  { slug: "viewer", name: "Viewer", permissions: [allow("cmek", "read"), allow("member", "read")] },
  { slug: "no-access", name: "No Access", permissions: [] }
];

const environments = (...names: [string, string][]) =>
  names.map(([name, slug], index) => ({ name, slug, position: index + 1 }));

const withBuiltInRoles = (type: ProjectType, custom: TProjectTemplate["roles"]) => {
  const builtIns = type === ProjectType.KMS ? kmsBuiltInRoles : builtInRoles;
  const builtInSlugs = new Set(builtIns.map((role) => role.slug));
  return [...builtIns, ...custom.filter((role) => !builtInSlugs.has(role.slug))];
};

const standardEnvironments = () =>
  environments(["Development", "dev"], ["Staging", "staging"], ["Production", "prod"]);

const template = (
  overrides: Partial<TProjectTemplate> & Pick<TProjectTemplate, "id" | "name">,
  daysAgo: number
): TProjectTemplate => {
  const type = overrides.type ?? ProjectType.SecretManager;
  return {
    environments: null,
    users: null,
    groups: null,
    identities: null,
    projectManagedIdentities: null,
    createdAt: at(daysAgo),
    updatedAt: at(Math.max(daysAgo - 3, 0)),
    ...overrides,
    type,
    roles: withBuiltInRoles(type, overrides.roles ?? [])
  };
};

const templates = createFixtureStore<TProjectTemplate[]>([
  template(
    {
      id: "template-default",
      name: "default",
      description: "Create projects with Infisical's default environments and roles.",
      roles: builtInRoles,
      environments: standardEnvironments()
    },
    400
  ),
  template(
    {
      id: "template-backend-services",
      name: "backend-services",
      description: "API and worker services with a shared deploy pipeline.",
      environments: standardEnvironments(),
      roles: [
        {
          slug: "deployer",
          name: "Deployer",
          permissions: [
            {
              subject: "secrets",
              action: ["describeSecret", "readValue"],
              conditions: { environment: { $in: ["staging", "prod"] } }
            },
            allow("secret-syncs", "read", "sync-secrets"),
            allow("environments", "read")
          ]
        },
        {
          slug: "on-call",
          name: "On-call engineer",
          permissions: [
            allow("secrets", "describeSecret", "readValue", "edit"),
            allow("secret-rollback", "read", "create")
          ]
        }
      ],
      users: [
        { username: "maya.patel@acme.dev", roles: ["admin"] },
        { username: "jonas.weber@acme.dev", roles: ["member", "deployer"] },
        { username: "lena.okafor@acme.dev", roles: ["on-call"] }
      ],
      groups: [
        { groupSlug: "platform-engineering", roles: ["member"] },
        { groupSlug: "sre", roles: ["on-call"] }
      ],
      identities: [
        {
          identityId: "identity-github-actions",
          identityName: "github-actions-ci",
          roles: ["deployer"]
        }
      ],
      projectManagedIdentities: [{ name: "service-runtime", roles: ["viewer"] }]
    },
    120
  ),
  template(
    {
      id: "template-data-platform",
      name: "data-platform",
      description: "Warehouses, pipelines and notebooks.",
      environments: environments(["Development", "dev"], ["QA", "qa"], ["Production", "prod"]),
      roles: [
        {
          slug: "analyst",
          name: "Analyst",
          permissions: [allow("secrets", "describeSecret"), allow("dynamic-secrets", "lease")]
        }
      ],
      users: [
        { username: "priya.raman@acme.dev", roles: ["admin"] },
        { username: "tomas.silva@acme.dev", roles: ["analyst"] }
      ],
      groups: [{ groupSlug: "data-science", roles: ["analyst"] }]
    },
    74
  ),
  template(
    {
      id: "template-frontend-apps",
      name: "frontend-apps",
      environments: environments(
        ["Development", "development"],
        ["Preview", "preview"],
        ["Production", "production"]
      ),
      users: [{ username: "sam.cho@acme.dev", roles: ["member"] }]
    },
    31
  ),
  template(
    {
      id: "template-kms-default",
      name: "default",
      type: ProjectType.KMS,
      description: "Create projects with Infisical's default roles.",
      roles: kmsBuiltInRoles
    },
    400
  ),
  template(
    {
      id: "template-kms-signing",
      name: "release-signing",
      type: ProjectType.KMS,
      description: "Keys for signing release artifacts.",
      roles: [
        {
          slug: "key-operator",
          name: "Key operator",
          permissions: [allow("cmek", "read", "encrypt", "decrypt")]
        }
      ],
      users: [{ username: "maya.patel@acme.dev", roles: ["admin"] }],
      identities: [
        { identityId: "identity-release-bot", identityName: "release-bot", roles: ["key-operator"] }
      ]
    },
    18
  )
]);

const orgUsers: TemplateOrgUser[] = [
  ["Maya", "Patel"],
  ["Jonas", "Weber"],
  ["Lena", "Okafor"],
  ["Priya", "Raman"],
  ["Tomas", "Silva"],
  ["Sam", "Cho"],
  ["Ines", "Moreau"],
  ["Kenji", "Watanabe"]
].map(([firstName, lastName]) => {
  const username = `${firstName}.${lastName}@acme.dev`.toLowerCase();
  return {
    id: `user-${firstName.toLowerCase()}`,
    user: { username, email: username, firstName, lastName }
  };
});

const orgGroups: TemplateOrgGroup[] = [
  ["Platform Engineering", "platform-engineering"],
  ["SRE", "sre"],
  ["Data Science", "data-science"],
  ["Security", "security"],
  ["Contractors", "contractors"]
].map(([name, slug]) => ({ id: `group-${slug}`, name, slug }));

const orgIdentities: TemplateOrgIdentity[] = [
  ["identity-github-actions", "github-actions-ci"],
  ["identity-release-bot", "release-bot"],
  ["identity-k8s-operator", "k8s-secrets-operator"],
  ["identity-terraform", "terraform-cloud"],
  ["identity-backstage", "backstage-catalog"]
].map(([id, name]) => ({ identity: { id, name } }));

const awsConnections = [
  ["connection-aws-security", "aws-security-account"],
  ["connection-aws-prod", "aws-production"],
  ["connection-aws-sandbox", "aws-sandbox"]
].map(([id, name]) => ({ id, name, app: AppConnection.AWS, projectId: null }));

const honeyToken = createFixtureStore<THoneyTokenConfig | null>({
  id: "honey-token-aws",
  orgId: "demo-org",
  type: HoneyTokenType.AWS,
  connectionId: "connection-aws-security",
  status: HoneyTokenConfigStatus.Complete,
  createdAt: at(12),
  updatedAt: at(12),
  decryptedConfig: {
    webhookSigningKey: "0123456789abcdef".repeat(4),
    stackName: "infisical-honey-tokens",
    awsRegion: "us-east-1"
  }
});

export const productSettingsDemo: ProductSettingsAdapter = {
  useSubscription: () =>
    ok({ projectTemplates: true, crossProjectSecretSharing: true, environmentLimit: 0 }),
  useProjectTemplates: () => ok(templates.use()),
  useCreateProjectTemplate: fixtureMutation(({ name, description, type }) => {
    const isKms = type === ProjectType.KMS;
    const created = template(
      {
        id: `template-${crypto.randomUUID()}`,
        name,
        description,
        type: type ?? ProjectType.SecretManager,
        roles: isKms ? kmsBuiltInRoles : builtInRoles,
        environments: isKms ? null : standardEnvironments()
      },
      0
    );
    templates.update((current) => [...current, created]);
    return created;
  }),
  useUpdateProjectTemplate: fixtureMutation(({ templateId, ...changes }) => {
    const current = templates.get().find((item) => item.id === templateId);
    if (!current) throw new Error("Project template not found");
    const updated: TProjectTemplate = {
      ...current,
      ...(Object.fromEntries(
        Object.entries(changes).filter(([, value]) => value !== undefined)
      ) as Partial<TProjectTemplate>),
      roles: changes.roles ? withBuiltInRoles(current.type, changes.roles) : current.roles,
      updatedAt: at(0)
    };
    templates.update((list) => list.map((item) => (item.id === templateId ? updated : item)));
    return updated;
  }),
  useDeleteProjectTemplate: fixtureMutation(({ templateId }) => {
    templates.update((current) => current.filter((item) => item.id !== templateId));
    return {};
  }),
  useHoneyTokenConfig: () => ok(honeyToken.use()),
  useUpsertHoneyTokenConfig: fixtureMutation(({ connectionId, config }) => {
    honeyToken.update((current) => ({
      id: current?.id ?? "honey-token-aws",
      orgId: "demo-org",
      type: HoneyTokenType.AWS,
      connectionId,
      status: current?.status ?? HoneyTokenConfigStatus.VerificationPending,
      createdAt: current?.createdAt ?? at(0),
      updatedAt: at(0),
      decryptedConfig: {
        webhookSigningKey: config.webhookSigningKey,
        stackName: config.stackName ?? "infisical-honey-tokens",
        awsRegion: config.awsRegion ?? "us-east-1"
      }
    }));
    return {};
  }),
  useTestHoneyTokenConnection: fixtureMutation(() => {
    const stackName = honeyToken.get()?.decryptedConfig?.stackName ?? "infisical-honey-tokens";
    honeyToken.update((current) =>
      current ? { ...current, status: HoneyTokenConfigStatus.Complete } : current
    );
    return { isConnected: true, status: "CREATE_COMPLETE", stackName };
  }),
  useAppConnections: () => ok(awsConnections),
  useOrgUsers: () => ok(orgUsers),
  useOrgGroups: () => ok(orgGroups),
  useSearchOrgIdentities: ({ search }) => {
    const needle = (search?.name as { $contains?: string } | undefined)?.$contains?.toLowerCase();
    return ok({
      identities: needle
        ? orgIdentities.filter(({ identity }) => identity.name.toLowerCase().includes(needle))
        : orgIdentities
    });
  }
};
