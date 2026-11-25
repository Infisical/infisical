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

const repeated = (count: number, make: (index: number) => TUserNotification) =>
  Array.from({ length: count }, (_, index) => make(index));

const gatewayAlert = (id: string, gateways: string, minutes: number, isRead = false) =>
  notification(id, NotificationType.GATEWAY_HEALTH_ALERT, "Gateway Health Alert", minutes, {
    body: `The following gateway(s) in your organization may be offline or unreachable: ${gateways}. Please check their status.`,
    link: org("/networking"),
    isRead
  });

const relayAlert = (id: string, relays: string, minutes: number, isRead = false) =>
  notification(id, NotificationType.RELAY_HEALTH_ALERT, "Relay Health Alert", minutes, {
    body: `The following relay(s) in your organization may be offline or unreachable: ${relays}. Please check their status.`,
    link: org("/networking"),
    isRead
  });

const syncFailed = (
  id: string,
  destination: string,
  name: string,
  error: string,
  minutes: number,
  isRead = false
) =>
  notification(
    id,
    NotificationType.SECRET_SYNC_FAILED,
    "Secret Sync Failed to Sync Secrets",
    minutes,
    {
      body: `Your **${destination}** sync **${name}** failed to complete: \`${error}\``,
      link: org("/projects/secret-management/payments-api/integrations"),
      isRead
    }
  );

const changeRequest = (id: string, project: string, minutes: number, isRead = false) =>
  notification(id, NotificationType.SECRET_CHANGE_REQUEST, "Secret Change Request", minutes, {
    body: `You have a new secret change request pending your review for the project **${project}** in the organization **Acme Corp**.`,
    link: org(`/projects/secret-management/${project}/approval`),
    isRead
  });

const OPTIMAL_NOTIFICATIONS: TUserNotification[] = [
  ...repeated(3, (index) => gatewayAlert(`n-gateway-${index}`, '"edge-eu-1"', 4 + index * 60)),
  changeRequest("n-change", "payments-api", 38),
  notification(
    "n-access",
    NotificationType.ACCESS_APPROVAL_REQUEST,
    "Access Approval Request",
    95,
    {
      body: "**Priya Patel** (priya@acme.dev) has requested temporary access to **/stripe** in the **prod** environment for project **payments-api**.",
      link: org("/projects/secret-management/payments-api/approval")
    }
  ),
  syncFailed("n-sync", "Vercel", "vercel-prod", "401 Unauthorized", 190, true),
  notification(
    "n-rotation",
    NotificationType.SECRET_ROTATION_FAILED,
    "Secret Rotation Failed",
    1300,
    {
      body: "Your **PostgreSQL Credentials** rotation **orders-db-rotation** failed to rotate secrets.",
      link: org("/projects/secret-management/payments-api/overview"),
      isRead: true
    }
  ),
  notification("n-invite", NotificationType.PROJECT_INVITATION, "Project Invitation", 1500, {
    body: "You've been invited to join the project **kms-keys**.",
    link: org("/projects/kms/kms-keys/overview"),
    isRead: true
  }),
  notification("n-device", NotificationType.LOGIN_FROM_NEW_DEVICE, "Login From New Device", 4300, {
    body: "A new device with IP **203.0.113.24** and User Agent **Firefox 132 on Linux** has logged into your account.",
    isRead: true
  })
];

const LONG_GATEWAY =
  '"andrey-aws-gw-us-east-1-production-primary-ingress-cluster-with-a-very-long-name"';
const LONG_RELAY =
  '"relay-us-east-1-production-primary-ingress-cluster-a", "relay-us-west-2-fallback"';

const STRESSED_NOTIFICATIONS: TUserNotification[] = [
  ...repeated(48, (index) =>
    gatewayAlert(`n-gw-long-${index}`, LONG_GATEWAY, 2 + index * 60, index > 43)
  ),
  ...repeated(36, (index) => relayAlert(`n-relay-${index}`, LONG_RELAY, 7 + index * 60)),
  ...repeated(18, (index) =>
    syncFailed(
      `n-sync-${index}`,
      "AWS Secrets Manager",
      "platform-core-with-a-very-long-project-name-production-us-east-1",
      "AccessDeniedException: User is not authorized to perform secretsmanager:PutSecretValue",
      15 + index * 90,
      index > 12
    )
  ),
  ...repeated(9, (index) =>
    changeRequest(
      `n-change-${index}`,
      index === 0
        ? "customer-billing-reconciliation-service-with-a-very-long-name"
        : `service-${index + 1}`,
      30 + index * 170,
      index > 5
    )
  ),
  ...repeated(6, (index) =>
    notification(
      `n-access-${index}`,
      NotificationType.ACCESS_APPROVAL_REQUEST,
      "Access Approval Request",
      50 + index * 400,
      {
        body: `**Alexandria Montgomery-Whitfield** (alexandria.montgomery-whitfield@acme-international.dev) has requested permanent access to **/platform/services/billing/stripe/webhooks/${index + 1}** in the **production-eu-central** environment for project **customer-billing-reconciliation-service**.`,
        link: org("/projects/secret-management/payments-api/approval"),
        isRead: index > 2
      }
    )
  ),
  notification("n-honey", NotificationType.HONEY_TOKEN_TRIGGERED, "Honey Token Triggered", 300, {
    body: "Honey token **aws-canary-prod** was used from IP **198.51.100.7**.",
    link: org("/networking")
  }),
  notification("n-sso", NotificationType.ADMIN_SSO_BYPASS, "Security Alert: SSO Bypass", 2900, {
    body: "**Sarah Lin** signed in with an admin account and bypassed SSO.",
    isRead: true
  })
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
              trialNotice("secrets_management", "payment_action_required"),
              trialNotice("pam", "payment_action_required")
            ]
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
  useMarkNotificationsRead: () => {
    const scenario = useShellScenario();
    return {
      mutateAsync: async ({ notificationIds }) =>
        notifications.update((current) => ({
          ...current,
          [scenario]: current[scenario].map((entry) =>
            notificationIds.includes(entry.id) ? { ...entry, isRead: true } : entry
          )
        })),
      isPending: false
    };
  },
  useDeleteNotifications: () => {
    const scenario = useShellScenario();
    return {
      mutateAsync: async ({ notificationIds }) =>
        notifications.update((current) => ({
          ...current,
          [scenario]: current[scenario].filter((entry) => !notificationIds.includes(entry.id))
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
