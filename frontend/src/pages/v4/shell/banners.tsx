import { type ReactNode, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import DOMPurify from "dompurify";
import { ChevronDown, ChevronUp } from "lucide-react";
import rehypeRaw from "rehype-raw";

import { formatFreeUsageCount } from "@app/components/agent-vault/FreeUsage/free-usage-format";
import {
  OrgGatewayPermissionActions,
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { setCertManagerActiveProjectCookie } from "@app/helpers/certManagerActiveProject";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";
import { ProjectType } from "@app/hooks/api/projects/types";
import type { SubscriptionPlanNotice } from "@app/hooks/api/subscriptions/types";
import { AnalyticsEvent } from "@app/lib/analytics";

import { failed } from "../access/toast";
import { useAgentVaultFreeUsage } from "../agent-vault/free-usage/use-free-usage";
import { useCertManagerProjectId } from "../cert-manager/components/certificate";
import { useV4Adapter, useV4Mode } from "../data/adapters";
import { useV4Session } from "../data/session/contract";
import { orgHref, useGo } from "../links";
import { useResolveV4Href } from "../resolveV4Href";

import styles from "./shell.module.css";

export type ShellBannerScope = "org" | "project" | "admin" | "personal";

type ShellBanner = {
  id: string;
  tone: "info" | "warn" | "bad";
  title?: string;
  message: ReactNode;
  actions?: ReactNode;
  dismiss?: "session" | "day";
};

const COLLAPSED_COUNT = 2;
const NETWORK_DISMISS_KEY = "network-health-banner-dismissed-at";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RELAY_HEARTBEAT_TIMEOUT_MS = 60 * 60 * 1000;
const SIGNUP_BANNER_MAX_SERVER_AGE_MS = 7 * ONE_DAY_MS;

const PRODUCT_LABELS: Record<string, string> = {
  secrets_management: "Secrets Management",
  cert_management: "Certificate Management",
  pam: "PAM",
  kms: "KMS"
};

const humanizeKey = (key: string) =>
  key
    .replace(/^legacy_/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const productLabel = (notice: SubscriptionPlanNotice) => {
  const product = PRODUCT_LABELS[notice.productKey] ?? humanizeKey(notice.productKey);
  return notice.trialPlanKey ? `${product} ${humanizeKey(notice.trialPlanKey)}` : product;
};

const productList = new Intl.ListFormat("en", { style: "long", type: "conjunction" });
const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

const listProducts = (notices: SubscriptionPlanNotice[]) =>
  productList.format(notices.map(productLabel));

const failureMessage = (notices: SubscriptionPlanNotice[]) => {
  const products = listProducts(notices);
  const accessEndsAt = shortDate.format(
    Math.min(...notices.map((notice) => new Date(notice.accessEndsAt).getTime()))
  );
  const isUpgradeOnly = notices.every((notice) => notice.trialPlanKey);
  const sharedCause = notices.every((notice) => notice.cause === notices[0].cause)
    ? notices[0].cause
    : undefined;
  const deadline = isUpgradeOnly
    ? `Complete payment before ${accessEndsAt}, or you'll return to your current plan.`
    : `Complete payment before ${accessEndsAt} to keep access.`;
  if (sharedCause === "payment_action_required")
    return `We couldn't charge your card for ${products}. ${deadline}`;
  if (sharedCause === "no_payment_method")
    return isUpgradeOnly
      ? `There's no card on file for ${products}. Add one or complete payment before ${accessEndsAt}, or you'll return to your current plan.`
      : `There's no card on file for ${products}. Add one or complete payment before ${accessEndsAt} to keep access.`;
  if (sharedCause === null && isUpgradeOnly)
    return `We couldn't charge for your ${products} upgrade. ${deadline}`;
  return `We're having trouble completing your ${products} subscription. ${deadline}`;
};

const docsAction = (href: string) => (
  <Button variant="link" size="sm" asChild>
    <a href={href} target="_blank" rel="noopener noreferrer">
      Configuration docs
    </a>
  </Button>
);

const plural = (count: number, noun: string) => `${count} ${noun}${count > 1 ? "s" : ""}`;

const useTrialBanner = (orgId: string): ShellBanner | undefined => {
  const shell = useV4Adapter("shell");
  const go = useGo();
  const { organization } = useV4Session();
  const { data: subscription } = shell.useSubscription(orgId);
  const { data: orgPermission } = useV4Adapter("access").useOrgPermission({ orgId });
  const now = Date.now();
  const notices = (subscription?.notices ?? []).filter(
    (notice) =>
      notice.type === "trial_payment_failed" && new Date(notice.accessEndsAt).getTime() > now
  );
  if (!notices.length) return undefined;
  const processing = notices.filter((notice) => notice.cause === "payment_processing");
  const failedNotices = notices.filter((notice) => notice.cause !== "payment_processing");
  const processingMessage = processing.length
    ? `Your payment for ${listProducts(processing)} is processing. Access continues meanwhile.`
    : "";
  if (!failedNotices.length)
    return { id: "trial-payment", tone: "info", message: processingMessage };
  const permission = orgPermission?.permission;
  const canResolve =
    !organization.isSubOrganization &&
    Boolean(permission?.can(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing)) &&
    Boolean(
      permission?.can(OrgPermissionBillingActions.ManageBilling, OrgPermissionSubjects.Billing)
    );
  return {
    id: "trial-payment",
    tone: "bad",
    title: "Action needed",
    message: [
      failureMessage(failedNotices),
      processingMessage,
      canResolve ? "" : "Ask an organization admin to update payment."
    ]
      .filter(Boolean)
      .join(" "),
    actions: canResolve && !processing.length && (
      <Button variant="outline" size="sm" onClick={() => go(orgHref(orgId, "/billing"))}>
        Complete payment
      </Button>
    )
  };
};

const useAgentVaultFreeUsageBanner = (orgId: string, enabled: boolean): ShellBanner | undefined => {
  const hasTrackedView = useRef(false);
  const {
    freeUsage,
    isLimitReached,
    warn,
    canAddPaymentMethod,
    isRootOrganization,
    openAddPaymentMethod,
    trackPaywall
  } = useAgentVaultFreeUsage(orgId, "agent-vault.free-usage-notice", enabled);
  const isShown = Boolean(freeUsage) && warn;
  const limit = freeUsage ? formatFreeUsageCount(freeUsage.limit) : "";
  const until = canAddPaymentMethod
    ? "until an admin adds a payment method or the month resets"
    : "until the month resets";
  const owner = isRootOrganization ? "This organization" : "Your root organization";
  const usageMessage = isLimitReached
    ? `${owner} used its ${limit} free Agent Vault requests this month. Agent requests are refused ${until}.`
    : `${owner} used ${freeUsage ? formatFreeUsageCount(freeUsage.used) : ""} of its ${limit} free Agent Vault requests this month. Once they're used, agent requests are refused ${until}.`;
  const askAdmin = isRootOrganization
    ? "Ask an organization admin to add a payment method."
    : "Ask an admin of the root organization to add a payment method.";
  const message = canAddPaymentMethod ? usageMessage : `${usageMessage} ${askAdmin}`;

  useEffect(() => {
    if (!isShown || hasTrackedView.current) return;
    hasTrackedView.current = true;
    trackPaywall(AnalyticsEvent.PaywallViewed, message);
  }, [isShown, message, trackPaywall]);

  if (!isShown) return undefined;
  return {
    id: "agent-vault-free-usage",
    tone: isLimitReached ? "bad" : "warn",
    dismiss: "session",
    message,
    actions: canAddPaymentMethod && (
      <Button variant="outline" size="sm" onClick={() => openAddPaymentMethod(message)}>
        Add payment method
      </Button>
    )
  };
};

const useNetworkBanner = (orgId: string, enabled: boolean): ShellBanner | undefined => {
  const shell = useV4Adapter("shell");
  const go = useGo();
  const { data: orgPermission } = useV4Adapter("access").useOrgPermission({ orgId });
  const permission = orgPermission?.permission;
  const canListGateways =
    enabled &&
    Boolean(
      permission?.can(OrgGatewayPermissionActions.ListGateways, OrgPermissionSubjects.Gateway)
    );
  const canListRelays =
    enabled &&
    Boolean(permission?.can(OrgRelayPermissionActions.ListRelays, OrgPermissionSubjects.Relay));
  const { data: gateways } = shell.useConnectedGateways(canListGateways);
  const { data: relays } = shell.useRelays(canListRelays);
  const gatewayCount = canListGateways
    ? (gateways?.filter((gateway) => !isGatewayHealthy(gateway)).length ?? 0)
    : 0;
  const relayCount = canListRelays
    ? (relays?.filter(
        (relay) =>
          relay.orgId &&
          relay.heartbeat &&
          new Date(relay.heartbeat).getTime() < Date.now() - RELAY_HEARTBEAT_TIMEOUT_MS
      ).length ?? 0)
    : 0;
  const count = gatewayCount + relayCount;
  if (!count) return undefined;
  const parts = [
    gatewayCount ? plural(gatewayCount, "gateway") : "",
    relayCount ? plural(relayCount, "relay") : ""
  ].filter(Boolean);
  return {
    id: "network-health",
    tone: "bad",
    dismiss: "day",
    message: `${parts.join(" and ")} in your organization ${count > 1 ? "are" : "is"} unreachable.`,
    actions: (
      <Button variant="outline" size="sm" onClick={() => go(orgHref(orgId, "/networking"))}>
        View networking
      </Button>
    )
  };
};

const INSTANCE_BANNERS: ShellBanner[] = [
  {
    id: "insecure-connection",
    tone: "warn",
    dismiss: "session",
    message:
      "Your connection to this Infisical instance is not secured via HTTPS. Some features may not behave as expected."
  },
  {
    id: "redis",
    tone: "warn",
    dismiss: "session",
    message: "Updated versions of Infisical now require Redis for full functionality.",
    actions: docsAction("https://infisical.com/docs/self-hosting/configuration/requirements#redis")
  },
  {
    id: "smtp",
    tone: "warn",
    dismiss: "session",
    message: "SMTP has not been configured for this instance.",
    actions: docsAction(
      "https://infisical.com/docs/self-hosting/configuration/envars#email-service"
    )
  },
  {
    id: "audit-log-storage",
    tone: "warn",
    dismiss: "session",
    message: "Audit log storage is disabled but no audit log streams have been configured.",
    actions: docsAction(
      "https://infisical.com/docs/documentation/platform/audit-log-streams/audit-log-streams"
    )
  },
  {
    id: "signup-disabled",
    tone: "warn",
    dismiss: "session",
    title: "Public user signups are disabled",
    message: "New users can only join through an organization invitation until you enable signups."
  }
];

const isNewServer = (createdAt?: string) =>
  Boolean(createdAt) &&
  Date.now() - new Date(createdAt!).getTime() < SIGNUP_BANNER_MAX_SERVER_AGE_MS;

const useInstanceBanners = (scope: ShellBannerScope, orgId: string): ShellBanner[] => {
  const shell = useV4Adapter("shell");
  const health = scope === "org" || scope === "admin";
  const { data: status, isPending } = shell.useServerStatus();
  const { data: subscription } = shell.useSubscription(orgId);
  const { data: config } = shell.useServerConfig();
  const auditLogs = health && Boolean(subscription?.auditLogs);
  const { data: streams } = shell.useAuditLogStreams(auditLogs);
  const secure = shell.useIsSecureContext();
  const ready = health && !isPending;
  const active: Record<string, boolean> = {
    "insecure-connection": !secure && scope !== "project",
    redis: ready && status?.redisConfigured === false,
    smtp: ready && status?.emailConfigured === false,
    "audit-log-storage":
      ready && auditLogs && Boolean(status?.auditLogStorageDisabled) && streams?.length === 0,
    "signup-disabled":
      scope === "admin" && config?.allowSignUp === false && isNewServer(config.createdAt)
  };
  return INSTANCE_BANNERS.filter((banner) => active[banner.id]);
};

const wasDismissedToday = () => {
  const dismissedAt = Number(localStorage.getItem(NETWORK_DISMISS_KEY));
  return Boolean(dismissedAt) && Date.now() - dismissedAt < ONE_DAY_MS;
};

const BannerStack = ({ banners }: { banners: ShellBanner[] }) => {
  const [dismissed, setDismissed] = useState<readonly string[]>(() =>
    wasDismissedToday() ? ["network-health"] : []
  );
  const [expanded, setExpanded] = useState(false);
  const dismissedIds = new Set(dismissed);
  const shown = banners.filter((banner) => !dismissedIds.has(banner.id));
  if (!shown.length) return null;
  const hidden = shown.length - COLLAPSED_COUNT;
  const visible = expanded || hidden <= 0 ? shown : shown.slice(0, COLLAPSED_COUNT);
  const dismiss = (banner: ShellBanner) => {
    if (banner.dismiss === "day") localStorage.setItem(NETWORK_DISMISS_KEY, String(Date.now()));
    setDismissed((current) => [...current, banner.id]);
  };
  return (
    <>
      {visible.map((banner) => (
        <Alert
          key={banner.id}
          tone={banner.tone}
          title={banner.title}
          actions={banner.actions}
          onDismiss={banner.dismiss ? () => dismiss(banner) : undefined}
          role={banner.tone === "bad" ? "alert" : "status"}
        >
          {banner.message}
        </Alert>
      ))}
      {hidden > 0 && (
        <Button
          variant="ghost"
          size="sm"
          icon={expanded ? ChevronUp : ChevronDown}
          className={styles.bannerToggle}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show fewer" : `Show ${hidden} more`}
        </Button>
      )}
    </>
  );
};

const AssumedPrivilegesBanner = ({ projectId, home }: { projectId: string; home: string }) => {
  const shell = useV4Adapter("shell");
  const live = useV4Mode() === "live";
  const go = useGo();
  const resolve = useResolveV4Href();
  const { data: assumed } = shell.useAssumedPrivileges(projectId);
  const exit = shell.useExitAssumedPrivileges();
  if (!assumed) return null;
  const leave = async () => {
    try {
      await exit.mutateAsync({ projectId });
      if (live) window.location.assign(resolve(home));
      else go(home);
    } catch (error) {
      failed("Failed to exit assumed privileges", error);
    }
  };
  return (
    <Alert
      tone="info"
      title="Assumed privileges"
      actions={
        <Button variant="outline" size="sm" loading={exit.isPending} onClick={leave}>
          Exit
        </Button>
      }
    >
      {`You're viewing this project with the privileges of ${
        assumed.actorType === ActorType.IDENTITY ? "machine identity" : "user"
      } ${assumed.actorName || assumed.actorEmail}.`}
    </Alert>
  );
};

const CertManagerAssumed = ({ orgId, home }: { orgId: string; home: string }) => {
  const { projectId } = useCertManagerProjectId(orgId);
  return projectId ? <AssumedPrivilegesBanner projectId={projectId} home={home} /> : null;
};

const SecretScanningAssumed = ({ orgId, home }: { orgId: string; home: string }) => {
  const { data: projectId } = useV4Adapter("secretScanning").useProjectId(orgId);
  return projectId ? <AssumedPrivilegesBanner projectId={projectId} home={home} /> : null;
};

const PamAssumed = ({ orgId, home }: { orgId: string; home: string }) => {
  const { data: projectId } = useV4Adapter("access").usePamProjectId(orgId);
  return projectId ? <AssumedPrivilegesBanner projectId={projectId} home={home} /> : null;
};

const CertManagerInstanceBanner = ({ orgId }: { orgId: string }) => {
  const resolve = useResolveV4Href();
  const go = useGo();
  const { data } = useV4Adapter("shell").useCertManagerInstance(orgId);
  if (!data?.isMultiInstance) return null;
  const active = data.projects.find((project) => project.id === data.activeProjectId);
  if (active && active.id === data.viewingProjectId)
    return (
      <Alert
        tone="warn"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => go(`${orgHref(orgId, "/settings")}?selectedTab=product-settings`)}
          >
            Manage projects
          </Button>
        }
      >
        This is your organization&apos;s active project. Use it for all work going forward.
      </Alert>
    );
  return (
    <Alert
      tone="warn"
      actions={
        active ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCertManagerActiveProjectCookie(orgId, active.id);
              window.location.assign(resolve(orgHref(orgId, "/cert-manager/overview")));
            }}
          >
            Switch to active project
          </Button>
        ) : (
          <Button variant="link" size="sm" asChild>
            <a
              href="https://infisical.com/docs/documentation/platform/pki/migration"
              target="_blank"
              rel="noopener noreferrer"
            >
              Migration guide
            </a>
          </Button>
        )
      }
    >
      You&apos;re viewing a legacy Certificate Manager project.
    </Alert>
  );
};

export type ShellBannerContext = {
  scope: ShellBannerScope;
  orgId: string;
  product?: ProjectType;
  projectId?: string;
  home?: string;
  certManagerOverview?: boolean;
};

export const ShellBanners = ({
  scope,
  orgId,
  product,
  projectId,
  home = "",
  certManagerOverview
}: ShellBannerContext) => {
  const trial = useTrialBanner(orgId);
  const agentVaultFreeUsage = useAgentVaultFreeUsageBanner(
    orgId,
    product === ProjectType.AgentVault && Boolean(projectId)
  );
  const network = useNetworkBanner(orgId, scope === "org");
  const instance = useInstanceBanners(scope, orgId);
  const stacked = [
    ...(scope === "org" || scope === "project" ? [trial] : []),
    agentVaultFreeUsage,
    network,
    ...instance
  ].filter((banner): banner is ShellBanner => Boolean(banner));
  let assumed: ReactNode = null;
  if (projectId) assumed = <AssumedPrivilegesBanner projectId={projectId} home={home} />;
  else if (product === ProjectType.CertificateManager)
    assumed = <CertManagerAssumed orgId={orgId} home={home} />;
  else if (product === ProjectType.SecretScanning)
    assumed = <SecretScanningAssumed orgId={orgId} home={home} />;
  else if (product === ProjectType.PAM) assumed = <PamAssumed orgId={orgId} home={home} />;
  return (
    <div className={styles.banners}>
      {assumed}
      {certManagerOverview && <CertManagerInstanceBanner orgId={orgId} />}
      <BannerStack banners={stacked} />
    </div>
  );
};

export const PageFrame = ({ scope }: { scope?: ShellBannerScope }) => {
  const { data: config } = useV4Adapter("shell").useServerConfig();
  if (scope === "personal" || !config?.pageFrameContent) return null;
  return (
    <div className={styles.pageFrame}>
      <ReactMarkdown rehypePlugins={[rehypeRaw]}>
        {DOMPurify.sanitize(config.pageFrameContent)}
      </ReactMarkdown>
    </div>
  );
};
