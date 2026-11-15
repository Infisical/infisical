import { useNavigate } from "@tanstack/react-router";

import { useLocalStorageState } from "@app/hooks";
import { AgentVaultSessionScope } from "@app/hooks/api/agentVault/enums";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";

const DISMISSED_STORAGE_KEY = "agentVaultSetupChecklistDismissed";

const NOTHING_DISMISSED: Record<string, boolean | undefined> = {};

const PROXY_PAGE_SIZE = 20;

export enum AgentVaultSetupStep {
  Proxy = "proxy",
  AccessBundle = "access-bundle",
  Service = "service",
  Session = "session"
}

export const useAgentVaultSetupProgress = (orgId: string, projectId: string) => {
  const agentVault = useV4Adapter("agentVault");
  const { data: permission, error: permissionError } = agentVault.useProjectPermission({
    projectId
  });
  const isPermissionLoaded = Boolean(permission) || Boolean(permissionError);
  const isAdmin = Boolean(
    permission?.memberships.some((membership) =>
      membership.roles.some(({ role }) => role === ProjectMembershipRole.Admin)
    )
  );

  const proxies = agentVault.useProxies(
    orgId,
    projectId,
    { limit: PROXY_PAGE_SIZE },
    { enabled: isAdmin }
  );
  const newestBundles = agentVault.useAccessBundles(
    orgId,
    projectId,
    { orderBy: "createdAt", orderDirection: "desc", limit: 1 },
    { enabled: isAdmin }
  );
  const fullestBundles = agentVault.useAccessBundles(
    orgId,
    projectId,
    { orderBy: "serviceCount", orderDirection: "desc", limit: 1 },
    { enabled: isAdmin }
  );
  const sessions = agentVault.useSessions(
    orgId,
    projectId,
    { scope: AgentVaultSessionScope.All, limit: 1 },
    { enabled: isAdmin }
  );
  const queries = [proxies, newestBundles, fullestBundles, sessions];

  const [dismissed, setDismissed] = useLocalStorageState(DISMISSED_STORAGE_KEY, NOTHING_DISMISSED);
  const isDismissed = Boolean(dismissed?.[projectId]);

  const isLoaded = queries.every((query) => Boolean(query.data));
  const isFailed = queries.some((query) => Boolean(query.error) && !query.data);
  const hasProxy = (proxies.data?.totalCount ?? 0) > 0;
  const hasConnectedProxy = Boolean(proxies.data?.proxies.some((proxy) => proxy.heartbeat));
  const newestBundle = newestBundles.data?.accessBundles[0];
  const hasService = (fullestBundles.data?.accessBundles[0]?.serviceCount ?? 0) > 0;
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
    isPermissionLoaded,
    isAdmin,
    isLoaded,
    isFailed,
    isVisible: isIncomplete && !isDismissed,
    canRestore: isIncomplete && isDismissed,
    dismiss: () => setDismissed((current) => ({ ...current, [projectId]: true })),
    restore: () => setDismissed((current) => ({ ...current, [projectId]: undefined })),
    hasProxy,
    hasConnectedProxy,
    newestBundle,
    hasService,
    hasSession,
    completedCount,
    nextStep: isLoaded ? nextStep : null
  };
};

export type TAgentVaultSetupProgress = ReturnType<typeof useAgentVaultSetupProgress>;

// Every target here takes the `create` search flag (agentVaultCreateIntentSearchParams).
export const agentVaultSetupStepLink = (
  step: AgentVaultSetupStep,
  orgId: string,
  projectId: string,
  newestBundleId?: string
) => {
  if (step === AgentVaultSetupStep.Proxy)
    return {
      to: v4Path("/organizations/$orgId/projects/agent-vault/$projectId/proxies"),
      params: { orgId, projectId }
    } as const;
  if (step === AgentVaultSetupStep.Service && newestBundleId)
    return {
      to: v4Path(
        "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
      ),
      params: { orgId, projectId, accessBundleId: newestBundleId }
    } as const;
  if (step === AgentVaultSetupStep.Session)
    return {
      to: v4Path("/organizations/$orgId/projects/agent-vault/$projectId/sessions"),
      params: { orgId, projectId }
    } as const;
  return {
    to: v4Path("/organizations/$orgId/projects/agent-vault/$projectId/access-bundles"),
    params: { orgId, projectId }
  } as const;
};

// A created-but-unconnected proxy has nothing left to create, so its step only opens the page.
const doesStepOpenCreate = (
  step: AgentVaultSetupStep,
  progress: Pick<TAgentVaultSetupProgress, "hasProxy">
) => step !== AgentVaultSetupStep.Proxy || !progress.hasProxy;

export const useOpenAgentVaultSetupStep = (
  orgId: string,
  projectId: string,
  progress: Pick<TAgentVaultSetupProgress, "hasProxy" | "newestBundle">
) => {
  const navigate = useNavigate();
  return (step: AgentVaultSetupStep) => {
    const link = agentVaultSetupStepLink(step, orgId, projectId, progress.newestBundle?.id);
    navigate({
      to: link.to,
      params: link.params as never,
      search: (doesStepOpenCreate(step, progress) ? { create: true } : {}) as never
    });
  };
};
