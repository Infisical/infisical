import { useEffect, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { CertificateSyncsUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import type { TPkiSyncForm } from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  type TPkiApplication
} from "@app/hooks/api/pkiApplications/types";

import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import type { PkiApplicationPermission } from "../../data/pki-applications/contract";
import { useUpgradeGate } from "../../license/useUpgradeGate";
import { orgHref } from "../../links";
import { CreatePkiSyncSheet } from "../components/pki-syncs/create-sync-sheet";
import { PKI_SYNC_DRAFT_STORAGE_KEY, PkiSyncScopeProvider } from "../components/pki-syncs/shared";
import { PkiSyncsTable } from "../components/pki-syncs/syncs-table";
import { appCan } from "./shared";

type Creating = { destination?: TPkiSyncForm["destination"]; initialData?: Partial<TPkiSyncForm> };

export const SyncsTab = ({
  orgId,
  projectId,
  application,
  access
}: {
  orgId: string;
  projectId: string;
  application: TPkiApplication;
  access: PkiApplicationPermission;
}) => {
  const navigate = useNavigate();
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const { connectionId, connectionName } = search as {
    connectionId?: string;
    connectionName?: string;
  };
  const { data, isPending, error } = useV4Adapter("pkiSyncs").useSyncs(projectId, {
    enabled: Boolean(projectId),
    refetchInterval: 30_000,
    applicationId: application.id
  });
  const { data: subscription } = useV4Adapter("pkiPolicies").useSubscription(orgId);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [creating, setCreating] = useState<Creating>();
  const canCreate = appCan(
    access,
    PkiApplicationResourceActions.Create,
    PkiApplicationResourceSub.PkiSyncs
  );

  useEffect(() => {
    if (!connectionId || !connectionName) return;
    navigate({ to: pathname, search: { selectedTab: "syncs" } as never, replace: true });
    const stored = sessionStorage.getItem(PKI_SYNC_DRAFT_STORAGE_KEY);
    sessionStorage.removeItem(PKI_SYNC_DRAFT_STORAGE_KEY);
    if (!stored) return;
    try {
      const draft = JSON.parse(stored) as Partial<TPkiSyncForm>;
      if (!draft.destination) return;
      setCreating({
        destination: draft.destination,
        initialData: {
          ...draft,
          connection: { ...draft.connection, id: connectionId, name: connectionName }
        } as Partial<TPkiSyncForm>
      });
    } catch {
      // A corrupt draft only loses the restore; the new connection still exists.
    }
  }, [connectionId, connectionName, navigate, pathname]);

  const addSync = () => {
    if (!subscription?.pkiSyncs) {
      openUpgradeGate({
        intent: CertificateSyncsUpgradeIntent,
        paywallKey: "cert-manager.application-syncs"
      });
      return;
    }
    setCreating({});
  };

  const addButton = (variant: "outline" | "accent") => (
    <Button
      variant={variant}
      icon="plus"
      disabledReason={canCreate ? undefined : RESTRICTED}
      onClick={addSync}
    >
      Add sync
    </Button>
  );

  return (
    <PkiSyncScopeProvider
      value={{
        orgId,
        projectId,
        applicationId: application.id,
        returnTo: orgHref(
          orgId,
          `/cert-manager/applications/${encodeURIComponent(application.name)}?selectedTab=syncs`
        )
      }}
    >
      <PkiSyncsTable
        orgId={orgId}
        syncs={data ?? []}
        isPending={isPending}
        error={error}
        fromApplication={application.name}
        label={`Certificate syncs in ${application.name}`}
        actions={addButton("accent")}
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="sync"
            title="No certificate syncs yet"
            actions={addButton("outline")}
          />
        }
      />
      <CreatePkiSyncSheet
        open={Boolean(creating)}
        onOpenChange={(open) => !open && setCreating(undefined)}
        destination={creating?.destination}
        initialData={creating?.initialData}
      />
      {upgradeGate}
    </PkiSyncScopeProvider>
  );
};
