import { useRouterState } from "@tanstack/react-router";

import { ActorType } from "@app/hooks/api/auditLogs/enums";
import type { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";
import { NotificationType, type TUserNotification } from "@app/hooks/api/notifications/types";
import type { TRelay } from "@app/hooks/api/relays/types";
import type { SubscriptionPlanNotice } from "@app/hooks/api/subscriptions/types";
import type { OrgUser } from "@app/hooks/api/users/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { adminDemo } from "../admin/demo";
import { createFixtureStore } from "../fixture-store";
import type { ShellAdapter } from "./contract";

const SCENARIOS = ["empty", "optimal", "stressed"] as const;
type ShellScenario = (typeof SCENARIOS)[number];

const useShellScenario = () =>
  useRouterState({
    select: (state) => {
      const value = (state.location.search as { shell?: unknown }).shell;
      return SCENARIOS.find((scenario) => scenario === value) ?? "empty";
    }
  });

const ok = <T>(data: T) => ({ data, isPending: false, error: null });

const NOW = Date.now();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const daysFromNow = (days: number) => new Date(NOW + days * 86_400_000).toISOString();
const org = (path: string) => `/organizations/${V4_DEMO_ORG_ID}${path}`;

const notification = (
  id: string,
  type: NotificationType,
  title: string,
  minutes: number,
  extra: Partial<TUserNotification> = {}
): TUserNotification => ({
  id,
  userId: "u-sarah",
  type,
  title,
  isRead: false,
  createdAt: minutesAgo(minutes),
  ...extra
});

const OPTIMAL_NOTIFICATIONS: TUserNotification[] = [
  notification(
    "n-gateway",
    NotificationType.GATEWAY_HEALTH_ALERT,
    "Gateway **edge-eu-1** is unreachable",
    4,
    {
      body: "No heartbeat for 12 minutes. Resources behind it can't be reached.",
      link: org("/networking")
    }
  ),
  notification(
    "n-change",
    NotificationType.SECRET_CHANGE_REQUEST,
    "Priya Patel requested a change in **payments-api**",
    38,
    {
      body: "3 secrets in production need your approval.",
      link: org("/projects/secret-management/payments-api/approval")
    }
  ),
  notification(
    "n-sync",
    NotificationType.SECRET_SYNC_FAILED,
    "Secret sync **vercel-prod** failed",
    190,
    {
      body: "Vercel rejected the token. Update the app connection and retry.",
      link: org("/projects/secret-management/payments-api/integrations"),
      isRead: true
    }
  ),
  notification(
    "n-invite",
    NotificationType.PROJECT_INVITATION,
    "You were added to **kms-keys**",
    1500,
    {
      link: org("/projects/kms/kms-keys/overview"),
      isRead: true
    }
  ),
  notification(
    "n-device",
    NotificationType.LOGIN_FROM_NEW_DEVICE,
    "New sign-in from Firefox on Linux",
    4300,
    {
      body: "If this wasn't you, change your password and revoke your sessions.",
      isRead: true
    }
  )
];

const STRESSED_TYPES = [
  NotificationType.RELAY_HEALTH_ALERT,
  NotificationType.ACCESS_APPROVAL_REQUEST,
  NotificationType.SECRET_ROTATION_FAILED,
  NotificationType.SECRET_SCANNING_SECRETS_DETECTED,
  NotificationType.PKI_SYNC_FAILED,
  NotificationType.IMPORT_SUCCESSFUL
];

const STRESSED_NOTIFICATIONS: TUserNotification[] = [
  notification(
    "n-relay-long",
    NotificationType.RELAY_HEALTH_ALERT,
    "Relay **relay-us-east-1-production-primary-ingress-cluster-a** has not sent a heartbeat in over an hour and every gateway routed through it is unreachable",
    1,
    {
      body: "Gateways edge-us-east-1a, edge-us-east-1b, edge-us-east-1c, edge-us-east-1d and 14 more depend on this relay. Check the relay host, its firewall rules and its enrollment token, then restart the relay service so it reconnects.",
      link: org("/networking")
    }
  ),
  ...Array.from({ length: 59 }, (_, index) =>
    notification(
      `n-stress-${index}`,
      STRESSED_TYPES[index % STRESSED_TYPES.length],
      `Rotation **db-credentials-${index + 1}** in **platform-core-with-a-very-long-project-name** failed`,
      5 + index * 47,
      {
        body:
          index % 3 === 0
            ? "The database rejected the new password. Infisical will retry in 10 minutes."
            : undefined,
        link:
          index % 2 === 0 ? org("/projects/secret-management/platform-core/overview") : undefined,
        isRead: index > 14
      }
    )
  )
];

const notifications = createFixtureStore<Record<ShellScenario, TUserNotification[]>>({
  empty: [],
  optimal: OPTIMAL_NOTIFICATIONS,
  stressed: STRESSED_NOTIFICATIONS
});

const exitedPrivileges = createFixtureStore<string[]>([]);

const gateway = (id: string, name: string): TGatewayV2 => ({
  id,
  name,
  identityId: null,
  relayId: "relay-1",
  createdAt: minutesAgo(90_000),
  updatedAt: minutesAgo(600),
  heartbeat: minutesAgo(600),
  heartbeatTTL: 60,
  directAddress: null,
  directHeartbeat: null,
  cliVersion: null,
  cliVersionReportedAt: null,
  canRevoke: true,
  connectedResourcesCount: 3,
  identity: null
});

const relay = (id: string): TRelay => ({
  id,
  name: id,
  host: `${id}.acme.dev`,
  orgId: V4_DEMO_ORG_ID,
  identityId: null,
  createdAt: minutesAgo(90_000),
  updatedAt: minutesAgo(600),
  heartbeat: minutesAgo(600)
});

const trialNotice = (productKey: string, cause: string | null): SubscriptionPlanNotice => ({
  type: "trial_payment_failed",
  productKey,
  trialPlanKey: null,
  accessEndsAt: daysFromNow(6),
  nextAttemptAt: daysFromNow(2),
  cause
});

const renewalNotice = (cause: string | null): SubscriptionPlanNotice => ({
  type: "subscription_payment_failed",
  cause,
  since: minutesAgo(3 * 24 * 60)
});

const admin = (
  id: string,
  firstName: string,
  lastName: string,
  email: string
): OrgUser["user"] => ({
  id,
  username: email,
  email,
  firstName,
  lastName,
  isEmailVerified: true,
  publicKey: "",
  superAdmin: true
});

const SERVER_ADMINS: Record<ShellScenario, OrgUser["user"][]> = {
  empty: [],
  optimal: [
    admin("a-sarah", "Sarah", "Lin", "sarah@acme.dev"),
    admin("a-marcus", "Marcus", "Reid", "marcus@acme.dev"),
    admin("a-priya", "Priya", "Patel", "priya@acme.dev")
  ],
  stressed: Array.from({ length: 36 }, (_, index) =>
    admin(
      `a-${index}`,
      index === 0 ? "Maximiliana-Alexandrina" : `Admin${index + 1}`,
      index === 0 ? "Featherstonehaugh-Montgomery" : "Operator",
      index === 0
        ? "maximiliana.featherstonehaugh-montgomery@platform-infrastructure.acme-holdings.dev"
        : `admin${index + 1}@acme.dev`
    )
  )
};

export const shellDemo: ShellAdapter = {
  useServerStatus: () => {
    const scenario = useShellScenario();
    return ok({
      date: minutesAgo(0),
      message: "Ok",
      emailConfigured: scenario === "empty",
      secretScanningConfigured: true,
      redisConfigured: scenario !== "stressed",
      samlDefaultOrgSlug: "",
      auditLogStorageDisabled: scenario === "stressed"
    });
  },
  useServerConfig: () => {
    const scenario = useShellScenario();
    const base = adminDemo.useServerConfig().data!;
    if (scenario === "empty")
      return ok({ ...base, pageFrameContent: "", latestAvailableVersion: null });
    if (scenario === "optimal")
      return ok({ ...base, pageFrameContent: "", latestAvailableVersion: "0.162.4" });
    return ok({
      ...base,
      allowSignUp: false,
      createdAt: minutesAgo(2 * 24 * 60),
      latestAvailableVersion: "0.162.4",
      pageFrameContent:
        "<strong>CONFIDENTIAL // ACME INTERNAL USE ONLY</strong> Access is monitored and recorded under policy SEC-114."
    });
  },
  useSubscription: () => {
    const scenario = useShellScenario();
    const base = adminDemo.useSubscription("").data!;
    return ok({
      ...base,
      notices:
        scenario === "stressed"
          ? [
              renewalNotice("payment_action_required"),
              trialNotice("secrets_management", "payment_action_required"),
              trialNotice("pam", "payment_action_required")
            ]
          : scenario === "optimal"
            ? [renewalNotice(null)]
            : []
    });
  },
  useAuditLogStreams: () => ok([]),
  useConnectedGateways: () => {
    const scenario = useShellScenario();
    if (scenario === "empty") return ok([]);
    if (scenario === "optimal") return ok([gateway("gw-1", "edge-eu-1")]);
    return ok(Array.from({ length: 4 }, (_, index) => gateway(`gw-${index}`, `edge-${index}`)));
  },
  useRelays: () =>
    ok(
      useShellScenario() === "stressed" ? [relay("relay-us-east-1"), relay("relay-eu-west-1")] : []
    ),
  useIsSecureContext: () => useShellScenario() !== "stressed",
  usePlatformVersion: () => (useShellScenario() === "empty" ? undefined : "0.159.15"),
  useAssumedPrivileges: (projectId) => {
    const scenario = useShellScenario();
    const exited = exitedPrivileges.use().includes(projectId);
    if (scenario === "empty" || exited) return ok(null);
    if (scenario === "optimal")
      return ok({
        actorId: "u-priya",
        actorType: ActorType.USER,
        actorEmail: "priya@acme.dev",
        actorName: "Priya Patel"
      });
    return ok({
      actorId: "id-deploy",
      actorType: ActorType.IDENTITY,
      actorEmail: "",
      actorName: "github-actions-deploy-production-us-east-1-payments-api-release-pipeline"
    });
  },
  useExitAssumedPrivileges: () => ({
    mutateAsync: async ({ projectId }) => {
      exitedPrivileges.update((current) => [...current, projectId]);
    },
    isPending: false
  }),
  useCertManagerInstance: () => {
    const scenario = useShellScenario();
    const projects = [
      {
        id: "internal-pki",
        name: "internal-pki",
        slug: "internal-pki",
        createdAt: minutesAgo(90_000)
      },
      { id: "legacy-pki", name: "legacy-pki", slug: "legacy-pki", createdAt: minutesAgo(400_000) }
    ];
    if (scenario === "empty")
      return ok({
        activeProjectId: "internal-pki",
        projects: [projects[0]],
        isMultiInstance: false,
        viewingProjectId: "internal-pki"
      });
    return ok({
      activeProjectId: "internal-pki",
      projects,
      isMultiInstance: true,
      viewingProjectId: scenario === "optimal" ? "internal-pki" : "legacy-pki"
    });
  },
  useNotifications: () => ok(notifications.use()[useShellScenario()]),
  useMarkAllNotificationsRead: () => {
    const scenario = useShellScenario();
    return {
      mutateAsync: async () =>
        notifications.update((current) => ({
          ...current,
          [scenario]: current[scenario].map((entry) => ({ ...entry, isRead: true }))
        })),
      isPending: false
    };
  },
  useMarkNotificationRead: () => {
    const scenario = useShellScenario();
    return {
      mutateAsync: async ({ notificationId }) =>
        notifications.update((current) => ({
          ...current,
          [scenario]: current[scenario].map((entry) =>
            entry.id === notificationId ? { ...entry, isRead: true } : entry
          )
        })),
      isPending: false
    };
  },
  useDeleteNotification: () => {
    const scenario = useShellScenario();
    return {
      mutateAsync: async ({ notificationId }) =>
        notifications.update((current) => ({
          ...current,
          [scenario]: current[scenario].filter((entry) => entry.id !== notificationId)
        })),
      isPending: false
    };
  },
  useDeleteAllNotifications: () => {
    const scenario = useShellScenario();
    return {
      mutateAsync: async () =>
        notifications.update((current) => ({
          ...current,
          [scenario]: current[scenario].filter((entry) => !entry.isRead)
        })),
      isPending: false
    };
  },
  useServerAdmins: () => ok(SERVER_ADMINS[useShellScenario()])
};
