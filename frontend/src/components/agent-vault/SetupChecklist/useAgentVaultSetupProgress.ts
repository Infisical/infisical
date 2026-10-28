import { linkOptions } from "@tanstack/react-router";

import { useOrganization, useProjectPermission } from "@app/context";
import { useLocalStorageState } from "@app/hooks";
import {
  AgentVaultSessionScope,
  useListAgentVaultAccessBundles,
  useListAgentVaultProxies,
  useListAgentVaultSessions
} from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const DISMISSED_STORAGE_KEY = "agentVaultSetupChecklistDismissed";

// Stable identity: useLocalStorageState re-runs its seeding effect whenever this changes.
const NOTHING_DISMISSED: Record<string, boolean | undefined> = {};

// The API allows at most 10 proxies per org (AGENT_VAULT_MAX_PROXIES_PER_ORG), so one page holds them all.
const PROXY_PAGE_SIZE = 20;

const POLL_INTERVAL_MS = 30_000;

export enum AgentVaultSetupStep {
  Proxy = "proxy",
  AccessBundle = "access-bundle",
  Service = "service",
  Session = "session"
}

// Only admins can set Agent Vault up, and listing every session is admin-only on the server, so none
// of these queries runs for a member.
export const useAgentVaultSetupProgress = () => {
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  // These two poll so a proxy coming online or a session created elsewhere ticks its step off, and stop
  // once that has happened: the sidebar mounts this hook on every Agent Vault page.
  const proxies = useListAgentVaultProxies(
    { limit: PROXY_PAGE_SIZE },
    {
      enabled: isAdmin,
      refetchInterval: (query) =>
        query.state.data?.proxies.some((proxy) => proxy.heartbeat) ? false : POLL_INTERVAL_MS
    }
  );
  const newestBundles = useListAgentVaultAccessBundles(
    { orderBy: "createdAt", orderDirection: "desc", limit: 1 },
    { enabled: isAdmin }
  );
  const fullestBundles = useListAgentVaultAccessBundles(
    { orderBy: "serviceCount", orderDirection: "desc", limit: 1 },
    { enabled: isAdmin }
  );
  const sessions = useListAgentVaultSessions(
    { scope: AgentVaultSessionScope.All, limit: 1 },
    {
      enabled: isAdmin,
      refetchInterval: (query) =>
        (query.state.data?.totalCount ?? 0) > 0 ? false : POLL_INTERVAL_MS
    }
  );
  const queries = [proxies, newestBundles, fullestBundles, sessions];

  const [dismissed, setDismissed] = useLocalStorageState(DISMISSED_STORAGE_KEY, NOTHING_DISMISSED);
  const isDismissed = Boolean(dismissed?.[currentOrg.id]);

  const isLoaded = queries.every((query) => Boolean(query.data));
  // A query with no data left after its retries would otherwise hold every caller waiting forever.
  const isFailed = queries.some((query) => query.isError && !query.data);
  const hasProxy = (proxies.data?.totalCount ?? 0) > 0;
  const hasConnectedProxy = Boolean(proxies.data?.proxies.some((proxy) => proxy.heartbeat));
  const newestBundle = newestBundles.data?.accessBundles[0];
  const hasService = (fullestBundles.data?.accessBundles[0]?.serviceCount ?? 0) > 0;
  const isSessionCountLoaded = Boolean(sessions.data);
  const hasSession = (sessions.data?.totalCount ?? 0) > 0;
  const completedCount = [hasConnectedProxy, Boolean(newestBundle), hasService, hasSession].filter(
    Boolean
  ).length;

  let nextStep: AgentVaultSetupStep | null = null;
  if (!hasConnectedProxy) nextStep = AgentVaultSetupStep.Proxy;
  else if (!newestBundle) nextStep = AgentVaultSetupStep.AccessBundle;
  else if (!hasService) nextStep = AgentVaultSetupStep.Service;
  else if (!hasSession) nextStep = AgentVaultSetupStep.Session;

  const isIncomplete = isAdmin && isLoaded && completedCount < 4;

  return {
    isAdmin,
    isLoaded,
    isFailed,
    isVisible: isIncomplete && !isDismissed,
    canRestore: isIncomplete && isDismissed,
    dismiss: () => setDismissed((current) => ({ ...current, [currentOrg.id]: true })),
    restore: () => setDismissed((current) => ({ ...current, [currentOrg.id]: undefined })),
    hasProxy,
    hasConnectedProxy,
    newestBundle,
    hasService,
    isSessionCountLoaded,
    hasSession,
    completedCount,
    nextStep: isLoaded ? nextStep : null
  };
};

export type TAgentVaultSetupProgress = ReturnType<typeof useAgentVaultSetupProgress>;

// The page that owns a step. The Service step needs a bundle to land on. Every target here takes the
// `create` search flag (agentVaultCreateIntentSearchParams), which useOpenAgentVaultSetupStep relies on.
export const getAgentVaultSetupStepLink = (
  step: AgentVaultSetupStep,
  orgId: string,
  newestBundleId?: string
) => {
  if (step === AgentVaultSetupStep.Proxy)
    return linkOptions({ to: "/organizations/$orgId/agent-vault/proxies", params: { orgId } });
  if (step === AgentVaultSetupStep.Service && newestBundleId)
    return linkOptions({
      to: "/organizations/$orgId/agent-vault/access-bundles/$accessBundleId",
      params: { orgId, accessBundleId: newestBundleId }
    });
  if (step === AgentVaultSetupStep.Session)
    return linkOptions({ to: "/organizations/$orgId/agent-vault/sessions", params: { orgId } });
  return linkOptions({ to: "/organizations/$orgId/agent-vault/access-bundles", params: { orgId } });
};

// A created-but-unconnected proxy has nothing left to create, so its step only opens the page.
export const doesAgentVaultSetupStepOpenCreate = (
  step: AgentVaultSetupStep,
  progress: Pick<TAgentVaultSetupProgress, "hasProxy">
) => step !== AgentVaultSetupStep.Proxy || !progress.hasProxy;
