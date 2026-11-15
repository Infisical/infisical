import { useRouterState } from "@tanstack/react-router";

import {
  AuditReportStatus,
  AuditReportType,
  OrgAuditReportType
} from "@app/hooks/api/auditReports/types";
import type { TAuditReport, TOrgAuditReport } from "@app/hooks/api/auditReports/types";
import { SecretFolderRole } from "@app/hooks/api/folderAccess/types";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import {
  UnusedAccessActorType,
  type TCalendarReminder,
  type TCalendarRotation,
  type TDuplicatedSecretGroup,
  type TGetOrgSecretValueTrackingStatusResponse,
  type TInsightRotationItem,
  type TInsightStaleSecretItem,
  type TOrgDuplicatedSecretGroup,
  type TOrgProjectInsight,
  type TUnusedAccessActor,
  type TUnusedSecret
} from "@app/hooks/api/secretInsights/types";
import { type SubscriptionPlan, SubscriptionPlanTypes } from "@app/hooks/api/subscriptions/types";

import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { SecretInsightsAdapter } from "./contract";

const SCENARIOS = ["optimal", "empty", "stress", "locked", "loading"] as const;
type Scenario = (typeof SCENARIOS)[number];

const useScenario = (): Scenario => {
  const value = useRouterState({
    select: (state) => new URLSearchParams(state.location.searchStr).get("scenario")
  });
  return SCENARIOS.find((scenario) => scenario === value) ?? "optimal";
};

const DAY_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (offsetDays: number) => new Date(now + offsetDays * DAY_MS).toISOString();
const isoDate = (offsetDays: number) => iso(offsetDays).slice(0, 10);

const result = <T>(data: T) => ({ data, isPending: false, error: null });
const pending = { data: undefined, isPending: true, error: null };

const LONG = "PAYMENTS_GATEWAY_WEBHOOK_SIGNING_SECRET_FOR_EU_CENTRAL_REGIONAL_FAILOVER_CLUSTER";
const LONG_PATH = "/services/payments/gateway/regional/eu-central/failover/cluster-blue";
const ENVS = ["dev", "staging", "prod"];
const ENV_NAMES: Record<string, string> = {
  dev: "Development",
  staging: "Staging",
  prod: "Production"
};

const repeat = <T>(count: number, make: (index: number) => T) =>
  Array.from({ length: count }, (_, index) => make(index));

const KEYS = [
  "STRIPE_API_KEY",
  "DATABASE_URL",
  "REDIS_PASSWORD",
  "SENDGRID_API_KEY",
  "JWT_SIGNING_KEY",
  "AWS_SECRET_ACCESS_KEY",
  "GITHUB_APP_PRIVATE_KEY",
  "SLACK_WEBHOOK_URL",
  "OPENAI_API_KEY",
  "SENTRY_DSN"
];
const keyAt = (index: number, stressed: boolean) =>
  stressed && index % 3 === 0 ? `${LONG}_${index}` : (KEYS[index % KEYS.length] ?? "SECRET");
const pathAt = (index: number, stressed: boolean) =>
  stressed && index % 2 === 0 ? LONG_PATH : ["/", "/api", "/workers", "/billing"][index % 4];

const subscription = (locked: boolean) =>
  ({
    slug: SubscriptionPlanTypes.Enterprise,
    tier: 3,
    secretAccessInsights: !locked,
    auditReports: !locked,
    status: "active"
  }) as unknown as SubscriptionPlan;

const rotationItem = (index: number, stressed: boolean, offset: number): TInsightRotationItem => ({
  name:
    stressed && index % 2 === 0
      ? `postgres-${LONG.toLowerCase()}-${index}`
      : `rotation-${["postgres", "mysql", "aws-iam", "ldap"][index % 4]}-${index + 1}`,
  environment: ENVS[index % 3],
  secretPath: pathAt(index, stressed),
  nextRotationAt: iso(offset),
  rotationStatus: null
});

const summary = (scenario: Scenario, offset: number, limit: number) => {
  if (scenario === "empty")
    return {
      upcomingRotations: [],
      failedRotations: [],
      upcomingReminders: [],
      overdueReminders: [],
      staleSecrets: [],
      totalStaleCount: 0
    };
  const stressed = scenario === "stress";
  const staleTotal = stressed ? 248 : 7;
  const stale: TInsightStaleSecretItem[] = repeat(staleTotal, (index) => ({
    key: keyAt(index, stressed),
    environment: ENVS[index % 3],
    secretPath: pathAt(index, stressed),
    updatedAt: iso(-(95 + index * 3))
  }));
  return {
    upcomingRotations: repeat(stressed ? 26 : 3, (index) =>
      rotationItem(index, stressed, 1 + (index % 6))
    ),
    failedRotations: repeat(stressed ? 9 : 1, (index) => ({
      ...rotationItem(index + 40, stressed, 0.2),
      rotationStatus: "failed"
    })),
    upcomingReminders: repeat(stressed ? 18 : 2, (index) => ({
      secretKey: keyAt(index + 1, stressed),
      environment: ENVS[index % 3],
      secretPath: pathAt(index, stressed),
      nextReminderDate: iso(2 + (index % 5))
    })),
    overdueReminders: repeat(stressed ? 6 : 0, (index) => ({
      secretKey: keyAt(index + 2, stressed),
      environment: ENVS[index % 3],
      secretPath: pathAt(index, stressed),
      nextReminderDate: iso(-(1 + index))
    })),
    staleSecrets: stale.slice(offset, offset + limit),
    totalStaleCount: staleTotal
  };
};

const reminderMessage = (stressed: boolean) =>
  stressed
    ? "Rotate this key with the vendor, then update the staging and production copies and confirm the webhook still verifies before closing the ticket."
    : "Rotate with the vendor before the quarterly audit.";

const actorName = (index: number, stressed: boolean) => {
  if (stressed && index % 4 === 0)
    return `regional-failover-replication-identity-eu-central-${index}`;
  if (index % 2 === 0)
    return `${["maria.chen", "dev.patel", "sam.okafor", "lena.ivanova"][index % 4]}@acme.example`;
  return ["ci-deployer", "payments-worker", "k8s-operator", "nightly-backup"][index % 4];
};

const calendar = (scenario: Scenario, month: number, year: number) => {
  if (scenario === "empty") return { rotations: [], reminders: [] };
  const stressed = scenario === "stress";
  const at = (day: number, hour = 9) => new Date(year, month - 1, day, hour).toISOString();
  const rotationDays = stressed ? repeat(40, (index) => 1 + ((index * 7) % 28)) : [3, 11, 18, 24];
  const reminderDays = stressed ? repeat(30, (index) => 1 + ((index * 5) % 28)) : [7, 11, 21];
  const rotations: TCalendarRotation[] = rotationDays.map((day, index) => ({
    id: `rotation-${year}-${month}-${index}`,
    name: rotationItem(index, stressed, 0).name,
    type: "postgres-credentials",
    nextRotationAt: at(day, 2 + (index % 20)),
    environment: ENVS[index % 3],
    secretPath: pathAt(index, stressed),
    secretKeys: stressed
      ? repeat(6, (key) => keyAt(key + index, true))
      : ["DB_USERNAME", "DB_PASSWORD"],
    rotationInterval: [30, 7, 90, 1][index % 4],
    rotationStatus: index === 1 ? "failed" : "success",
    isAutoRotationEnabled: index !== 2
  }));
  const reminders: TCalendarReminder[] = reminderDays.map((day, index) => ({
    id: `reminder-${year}-${month}-${index}`,
    secretId: `secret-${index}`,
    secretKey: keyAt(index + 3, stressed),
    nextReminderDate: at(day),
    message: index % 2 === 0 ? reminderMessage(stressed) : null,
    environment: ENVS[index % 3],
    secretPath: pathAt(index, stressed),
    repeatDays: index % 2 === 0 ? 90 : null
  }));
  return { rotations, reminders };
};

const ACTORS = [
  { name: "payments-worker", type: "identity" },
  { name: "ci-deployer", type: "identity" },
  { name: "maria.chen@acme.example", type: "user" },
  { name: "k8s-operator", type: "identity" },
  { name: "dev.patel@acme.example", type: "user" },
  { name: "nightly-backup", type: "identity" }
];

const accessVolume = (scenario: Scenario) => ({
  days: repeat(7, (index) => {
    const date = isoDate(index - 6);
    if (scenario === "empty") return { date, total: 0, actors: [] };
    const scale = scenario === "stress" ? 4180 : 140;
    const total = Math.round(scale * (0.6 + ((index * 37) % 10) / 10));
    const actors = ACTORS.map((actor, actorIndex) => ({
      ...actor,
      name:
        scenario === "stress" && actorIndex === 0
          ? "payments-gateway-regional-failover-worker-eu-central-blue"
          : actor.name,
      count: Math.round(total / (actorIndex + 2))
    }));
    return { date, total, actors };
  })
});

const AUTH_METHODS = [
  "Universal Auth",
  "Kubernetes Auth",
  "AWS Auth",
  "OIDC Auth",
  "JWT Auth",
  "GCP Auth",
  "Azure Auth",
  "Token Auth",
  "LDAP Auth",
  "TLS Certificate Auth",
  "SPIFFE Auth",
  "OCI Auth",
  "Unknown"
];

const authMethods = (scenario: Scenario) => {
  if (scenario === "empty") return { methods: [] };
  const names = scenario === "stress" ? AUTH_METHODS : [...AUTH_METHODS.slice(0, 4), "Unknown"];
  return {
    methods: names.map((method, index) => ({ method, count: Math.round(9200 / (index + 1)) }))
  };
};

const roles = [{ id: null, slug: "developer", name: "Developer" }];

const unusedActors = (scenario: Scenario): TUnusedAccessActor[] => {
  if (scenario === "empty") return [];
  const stressed = scenario === "stress";
  return repeat(stressed ? 64 : 6, (index) => {
    const isUser = index % 2 === 0;
    const accessible = 12 + ((index * 17) % 140);
    const unused = Math.max(1, Math.round(accessible * [0.92, 0.5, 0.12, 1, 0.3, 0.76][index % 6]));
    return {
      actorType: isUser ? UnusedAccessActorType.User : UnusedAccessActorType.Identity,
      actorId: `actor-${index}`,
      name: actorName(index, stressed),
      accessibleSecretCount: accessible,
      unusedSecretCount: unused,
      environments: stressed ? ENVS : ENVS.slice(0, 1 + (index % 3)),
      accessPaths: {
        roles: stressed
          ? [...roles, { id: "role-ops", slug: "custom", name: "Platform Operations On-call" }]
          : roles,
        groups: index % 3 === 0 ? [{ id: `group-${index}`, name: "Backend Engineers", roles }] : [],
        additionalPrivileges:
          stressed && index % 2 === 1
            ? [{ id: `privilege-${index}`, name: "Temporary prod read" }]
            : [],
        folderAccess:
          index % 4 === 1
            ? [
                {
                  id: `folder-access-${index}`,
                  folderId: `folder-${index}`,
                  environment: "prod",
                  secretPath: stressed ? LONG_PATH : "/billing",
                  role: SecretFolderRole.Read
                }
              ]
            : []
      }
    };
  });
};

const unusedSecrets = (actor: TUnusedAccessActor, stressed: boolean): TUnusedSecret[] =>
  repeat(Math.min(actor.unusedSecretCount, 200), (index) => ({
    secretKey: `${keyAt(index, stressed)}${index >= KEYS.length ? `_${index}` : ""}`,
    environment: actor.environments[index % actor.environments.length],
    secretPath: pathAt(Math.floor(index / 4), stressed)
  }));

const duplicateGroups = (scenario: Scenario): TDuplicatedSecretGroup[] => {
  if (scenario === "empty") return [];
  const stressed = scenario === "stress";
  return repeat(stressed ? 14 : 3, (group) => ({
    secrets: repeat(stressed ? 4 + (group % 9) : 2 + group, (index) => {
      const slug = ENVS[(group + index) % 3];
      return {
        key: keyAt(group + index, stressed),
        environment: { slug, name: ENV_NAMES[slug] },
        secretPath: pathAt(index, stressed)
      };
    })
  }));
};

const auditReport = (index: number, stressed: boolean): TAuditReport => {
  const types = Object.values(AuditReportType);
  const statuses = [
    AuditReportStatus.Completed,
    AuditReportStatus.Processing,
    AuditReportStatus.Partial,
    AuditReportStatus.Failed,
    AuditReportStatus.Pending
  ];
  return {
    id: `report-${index}`,
    projectId: "payments-api",
    requestedByUserId: "user-1",
    status: statuses[index % statuses.length],
    reportConfigs: (stressed ? types : types.slice(index % 3, (index % 3) + 1 + (index % 2))).map(
      (type) => ({ type, inputs: {} })
    ),
    emailRecipients: stressed
      ? repeat(6, (recipient) => `compliance-team-${recipient}@acme-holdings-international.example`)
      : ["auditor@acme.example", ...(index % 2 ? ["security@acme.example"] : [])],
    resultSummary: null,
    errorMessage: index % 5 === 3 ? "The email provider rejected the attachment size." : null,
    createdAt: iso(-index * 2 - 0.1),
    updatedAt: iso(-index * 2)
  };
};

const reportsStore = createFixtureStore<Record<"optimal" | "stress", TAuditReport[]>>({
  optimal: repeat(4, (index) => auditReport(index, false)),
  stress: repeat(37, (index) => auditReport(index, true))
});

const blindIndexStore = createFixtureStore<"completed" | "pending">("completed");

const orgProject = (
  index: number,
  projectId: string,
  projectName: string,
  severityScore: number,
  warnings: Partial<TOrgProjectInsight["warnings"]>
): TOrgProjectInsight => ({
  projectId,
  projectName,
  projectSlug: projectName.toLowerCase().replace(/\s+/g, "-"),
  totalSecrets: 120 + index * 37,
  severityScore,
  warnings: {
    duplicatedSecrets: 0,
    staleSecrets: 0,
    failedRotations: 0,
    failedSyncs: 0,
    orphanedLeases: 0,
    ...warnings
  }
});

const orgProjects = (scenario: Scenario) => {
  if (scenario === "empty")
    return { projects: [], totalProjects: 0, projectsWithIssues: 0, offset: 0, limit: 100 };
  if (scenario === "stress") {
    const projects = repeat(100, (index) =>
      orgProject(
        index,
        index === 0 ? "payments-api" : `stress-project-${index}`,
        index % 5 === 0
          ? `Regional Payments Gateway Failover Cluster for EU Central ${index}`
          : `Service ${index}`,
        index < 60 ? 60 - index : 0,
        index < 60
          ? {
              failedRotations: index % 3,
              failedSyncs: (index * 7) % 5,
              orphanedLeases: index % 4,
              duplicatedSecrets: index % 2 ? 1200 + index : null,
              staleSecrets: 3000 - index * 11
            }
          : {}
      )
    );
    return { projects, totalProjects: 340, projectsWithIssues: 212, offset: 0, limit: 100 };
  }
  return {
    projects: [
      orgProject(1, "payments-api", "Payments API", 9, { failedRotations: 2, staleSecrets: 14 }),
      orgProject(2, "web-dashboard", "Web Dashboard", 7, { failedSyncs: 3, duplicatedSecrets: 6 }),
      orgProject(3, "platform-core", "Platform Core", 5, { staleSecrets: 21 }),
      orgProject(4, "mobile-backend", "Mobile Backend", 3, {
        duplicatedSecrets: 4,
        orphanedLeases: 1
      }),
      orgProject(5, "internal-tools", "Internal Tools", 2, { staleSecrets: 5 }),
      orgProject(6, "data-pipeline", "Data Pipeline", 0, {}),
      orgProject(7, "marketing-site", "Marketing Site", 0, {})
    ],
    totalProjects: 7,
    projectsWithIssues: 5,
    offset: 0,
    limit: 100
  };
};

const orgAuthMethods = (scenario: Scenario) => {
  if (scenario === "empty") return { totalFetches: 0, methods: [] };
  const methods = (
    scenario === "stress"
      ? Object.values(IdentityAuthMethod)
      : [
          IdentityAuthMethod.UNIVERSAL_AUTH,
          IdentityAuthMethod.KUBERNETES_AUTH,
          IdentityAuthMethod.AWS_AUTH,
          IdentityAuthMethod.TOKEN_AUTH
        ]
  ).map((authMethod, index) => ({ authMethod, count: Math.round(21450 / (index + 1)) }));
  return { totalFetches: methods.reduce((sum, method) => sum + method.count, 0), methods };
};

const WEEKLY = [34, 41, 28, 52, 47, 63, 38, 55, 71, 49, 66, 24];
const orgStaticSecrets = (scenario: Scenario) => ({
  weeks:
    scenario === "empty"
      ? []
      : WEEKLY.map((count, index) => ({
          weekStart: isoDate(-(WEEKLY.length - 1 - index) * 7),
          totalSecrets: scenario === "stress" ? count * 1730 : count,
          isPartial: index === WEEKLY.length - 1
        }))
});

const orgAccessVolume = (scenario: Scenario) => ({
  days:
    scenario === "empty"
      ? []
      : [3120, 3480, 2910, 4020, 4410, 2380, 2150].map((total, index) => ({
          date: isoDate(index - 6),
          total: scenario === "stress" ? total * 913 : total
        }))
});

const orgDuplicateGroups = (scenario: Scenario): TOrgDuplicatedSecretGroup[] => {
  if (scenario === "empty") return [];
  const stressed = scenario === "stress";
  const projects = [
    { projectId: "payments-api", projectName: "Payments API" },
    { projectId: "web-dashboard", projectName: "Web Dashboard" },
    {
      projectId: "archived-billing",
      projectName: stressed ? "Regional Payments Gateway Failover Cluster" : "Archived Billing"
    }
  ];
  return repeat(stressed ? 16 : 3, (group) => {
    const secrets = repeat(stressed ? 3 + (group % 10) : 2 + group, (index) => {
      const slug = ENVS[(group + index) % 3];
      return {
        ...projects[(group + index) % (group === 0 ? 1 : 3)],
        key: keyAt(group + index, stressed),
        environment: { slug, name: ENV_NAMES[slug] },
        secretPath: pathAt(index, stressed)
      };
    });
    return {
      projectCount: new Set(secrets.map((secret) => secret.projectId)).size,
      locationCount: new Set(
        secrets.map(
          (secret) => `${secret.projectId}:${secret.environment.slug}:${secret.secretPath}`
        )
      ).size,
      secrets
    };
  });
};

const valueTrackingStore = createFixtureStore<TGetOrgSecretValueTrackingStatusResponse>({
  status: "completed",
  projectsTotal: 7,
  projectsDone: 7,
  secretsProcessed: 1840
});

const orgReport = (index: number, stressed: boolean): TOrgAuditReport => ({
  id: `org-report-${index}`,
  orgId: "demo",
  requestedByUserId: "user-1",
  status: index === 0 && stressed ? AuditReportStatus.Processing : AuditReportStatus.Completed,
  reportConfigs: Object.values(OrgAuditReportType).map((type) => ({ type, inputs: {} })),
  emailRecipients: ["auditor@acme.example"],
  resultSummary: null,
  errorMessage: null,
  createdAt: iso(-3 - index * 7),
  updatedAt: iso(-3 - index * 7)
});

const orgReportsStore = createFixtureStore<TOrgAuditReport[]>([
  orgReport(0, false),
  orgReport(1, false)
]);

const reportKey = (scenario: Scenario) => (scenario === "stress" ? "stress" : "optimal");

export const secretInsightsDemo: SecretInsightsAdapter = {
  useSubscription: () => result(subscription(useScenario() === "locked")),
  useIsAuditLogAnalyticsEnabled: () => true,

  useCounts: () => {
    const scenario = useScenario();
    if (scenario === "empty")
      return result({
        secretCount: 0,
        folderCount: 0,
        dynamicSecretCount: 0,
        secretRotationCount: 0,
        honeyTokenCount: 0
      });
    const scale = scenario === "stress" ? 1873 : 1;
    return result({
      secretCount: 48 * scale,
      folderCount: 9 * scale,
      dynamicSecretCount: 3 * scale,
      secretRotationCount: 4 * scale,
      honeyTokenCount: 2 * scale
    });
  },
  useSummary: ({ staleSecretsOffset = 0, staleSecretsLimit = 10 }) => {
    const scenario = useScenario();
    return scenario === "loading"
      ? pending
      : result(summary(scenario, staleSecretsOffset, staleSecretsLimit));
  },
  useCalendar: ({ month, year }) => {
    const scenario = useScenario();
    return scenario === "loading" ? pending : result(calendar(scenario, month, year));
  },
  useAccessVolume: () => {
    const scenario = useScenario();
    return scenario === "loading" ? pending : result(accessVolume(scenario));
  },
  useAuthMethodDistribution: () => {
    const scenario = useScenario();
    return scenario === "loading" ? pending : result(authMethods(scenario));
  },
  useUnusedAccess: ({ offset, limit, search }) => {
    const scenario = useScenario();
    if (scenario === "loading") return pending;
    const query = search?.toLowerCase() ?? "";
    const actors = unusedActors(scenario).filter((actor) =>
      actor.name.toLowerCase().includes(query)
    );
    return result({
      actors: actors.slice(offset, offset + limit),
      totalCount: actors.length,
      unusedAccessFrom: scenario === "empty" ? iso(12) : iso(-30),
      remainingTtl: scenario === "stress" ? 45 : 2400
    });
  },
  useUnusedAccessActor: ({ actorId }) => {
    const scenario = useScenario();
    const actor = unusedActors(scenario).find((entry) => entry.actorId === actorId);
    if (!actor)
      return { data: undefined, isPending: false, error: new Error("Identity not found") };
    return result({
      actor,
      secrets: unusedSecrets(actor, scenario === "stress"),
      unusedAccessFrom: iso(-30),
      remainingTtl: 2400
    });
  },
  useSecretsDuplication: () => {
    const scenario = useScenario();
    const status = blindIndexStore.use();
    if (scenario === "loading") return pending;
    return result({
      secretBlindIndexEnabled: status === "completed",
      groups: duplicateGroups(scenario),
      remainingTtl: scenario === "stress" ? 30 : 540
    });
  },
  useBlindIndexStatus: () => result({ status: blindIndexStore.use() }),
  useEnableBlindIndex: fixtureMutation(() => {
    blindIndexStore.update(() => "pending");
    setTimeout(() => blindIndexStore.update(() => "completed"), 2500);
    return { message: "ok" };
  }),
  useRefreshSecretsDuplication: () => () => undefined,
  useAuditReports: ({ offset = 0, limit = 10 }) => {
    const scenario = useScenario();
    const all = reportsStore.use();
    if (scenario === "loading") return pending;
    const reports = scenario === "empty" ? [] : all[reportKey(scenario)];
    return result({ reports: reports.slice(offset, offset + limit), totalCount: reports.length });
  },
  useRequestAuditReport: fixtureMutation(({ reports, emailRecipients }) => {
    reportsStore.update((current) => ({
      ...current,
      optimal: [
        {
          ...auditReport(0, false),
          id: `report-${Date.now()}`,
          status: AuditReportStatus.Pending,
          reportConfigs: reports.map(({ type }) => ({ type, inputs: {} })),
          emailRecipients: emailRecipients ?? ["you@acme.example"],
          createdAt: new Date().toISOString()
        },
        ...current.optimal
      ]
    }));
  }),
  useDeleteAuditReport: fixtureMutation(({ auditReportId }) => {
    reportsStore.update((current) => ({
      optimal: current.optimal.filter((report) => report.id !== auditReportId),
      stress: current.stress.filter((report) => report.id !== auditReportId)
    }));
  }),

  useOrgSummary: () => {
    const scenario = useScenario();
    if (scenario === "loading") return pending;
    if (scenario === "empty") return result({ activeLeases: 0, users: 1, identities: 0 });
    const scale = scenario === "stress" ? 1291 : 1;
    return result({ activeLeases: 42 * scale, users: 128 * scale, identities: 57 * scale });
  },
  useOrgProjects: () => {
    const scenario = useScenario();
    const base = scenario === "loading" ? pending : result(orgProjects(scenario));
    return {
      ...base,
      hasMore: scenario === "stress",
      loadMore: () => undefined,
      isLoadingMore: false
    };
  },
  useOrgAuthMethods: () => {
    const scenario = useScenario();
    return scenario === "loading" ? pending : result(orgAuthMethods(scenario));
  },
  useOrgStaticSecrets: () => {
    const scenario = useScenario();
    return scenario === "loading" ? pending : result(orgStaticSecrets(scenario));
  },
  useOrgAccessVolume: () => {
    const scenario = useScenario();
    return scenario === "loading" ? pending : result(orgAccessVolume(scenario));
  },
  useOrgDuplication: () => {
    const scenario = useScenario();
    if (scenario === "loading") return pending;
    return result({
      orgWideSecretValueTrackingEnabled: true,
      groups: orgDuplicateGroups(scenario),
      remainingTtl: 540
    });
  },
  useOrgValueTrackingStatus: () => {
    const scenario = useScenario();
    const status = valueTrackingStore.use();
    if (scenario === "empty") return result({ ...status, status: "not-found" as const });
    return result(status);
  },
  useEnableOrgValueTracking: fixtureMutation(() => {
    valueTrackingStore.update((current) => ({ ...current, status: "pending", projectsDone: 2 }));
    setTimeout(
      () =>
        valueTrackingStore.update((current) => ({
          ...current,
          status: "completed",
          projectsDone: current.projectsTotal
        })),
      2500
    );
    return { message: "ok" };
  }),
  useOrgAuditReports: () => {
    const scenario = useScenario();
    const reports = orgReportsStore.use();
    if (scenario === "empty") return result({ reports: [], totalCount: 0 });
    const list = scenario === "stress" ? [orgReport(0, true), ...reports] : reports;
    return result({ reports: list, totalCount: list.length });
  },
  useRequestOrgAuditReport: fixtureMutation(({ reports, emailRecipients }) => {
    orgReportsStore.update((current) => [
      {
        ...orgReport(0, false),
        id: `org-report-${Date.now()}`,
        status: AuditReportStatus.Pending,
        reportConfigs: reports.map(({ type }) => ({ type, inputs: {} })),
        emailRecipients: emailRecipients ?? ["you@acme.example"],
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
  })
};
