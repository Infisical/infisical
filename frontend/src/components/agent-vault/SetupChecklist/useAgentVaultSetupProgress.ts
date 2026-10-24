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

export const useAgentVaultSetupProgress = () => {
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const { data: proxies } = useListAgentVaultProxies({ limit: 20 });
  const { data: newestBundles } = useListAgentVaultAccessBundles({
    orderBy: "createdAt",
    orderDirection: "desc",
    limit: 1
  });
  const { data: fullestBundles } = useListAgentVaultAccessBundles({
    orderBy: "serviceCount",
    orderDirection: "desc",
    limit: 1
  });
  const { data: sessions } = useListAgentVaultSessions({
    scope: AgentVaultSessionScope.All,
    limit: 1
  });

  const [dismissed, setDismissed] = useLocalStorageState(DISMISSED_STORAGE_KEY, NOTHING_DISMISSED);
  const isDismissed = Boolean(dismissed?.[currentOrg.id]);

  const isLoaded = Boolean(proxies && newestBundles && fullestBundles && sessions);
  const hasProxy = (proxies?.totalCount ?? 0) > 0;
  const hasConnectedProxy = Boolean(proxies?.proxies.some((proxy) => proxy.heartbeat));
  const newestBundle = newestBundles?.accessBundles[0];
  const hasService = (fullestBundles?.accessBundles[0]?.serviceCount ?? 0) > 0;
  const hasSession = (sessions?.totalCount ?? 0) > 0;
  const completedCount = [hasConnectedProxy, Boolean(newestBundle), hasService, hasSession].filter(
    Boolean
  ).length;

  const isIncomplete = isAdmin && isLoaded && completedCount < 4;

  return {
    isAdmin,
    isLoaded,
    isVisible: isIncomplete && !isDismissed,
    canRestore: isIncomplete && isDismissed,
    dismiss: () => setDismissed((current) => ({ ...current, [currentOrg.id]: true })),
    restore: () => setDismissed((current) => ({ ...current, [currentOrg.id]: undefined })),
    hasProxy,
    hasConnectedProxy,
    newestBundle,
    hasService,
    hasSession,
    completedCount
  };
};
