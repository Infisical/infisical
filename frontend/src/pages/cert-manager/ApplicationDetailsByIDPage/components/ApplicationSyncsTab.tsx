import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

import { CertificateSyncsUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import { CreatePkiSyncModal } from "@app/components/pki-syncs";
import { TPkiSyncForm } from "@app/components/pki-syncs/forms";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  PageLoader
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  useGetPkiApplicationPermissions
} from "@app/hooks/api/pkiApplications";
import { PkiSync, useListPkiSyncs } from "@app/hooks/api/pkiSyncs";

import { PkiSyncsTable } from "../../IntegrationsListPage/components/PkiSyncsTab/PkiSyncTable";
import { PkiDocsUrls } from "../../pki-docs-urls";
import { ApplicationTab } from "../application-tabs";

type Props = { applicationId: string; applicationName: string; projectId: string };

export const ApplicationSyncsTab = ({ applicationId, applicationName, projectId }: Props) => {
  const [isAddSyncOpen, setIsAddSyncOpen] = useState(false);
  const [restoredSync, setRestoredSync] = useState<{
    destination: PkiSync;
    initialData: Partial<TPkiSyncForm>;
  } | null>(null);
  const navigate = useNavigate();
  const {
    location: { pathname, search }
  } = useRouterState();
  const { connectionId, connectionName } = search as {
    connectionId?: string;
    connectionName?: string;
  };

  useEffect(() => {
    if (!connectionId || !connectionName) return;

    const storedFormData = localStorage.getItem("pkiSyncFormData");

    if (storedFormData) {
      try {
        const { returnUrl, ...form } = JSON.parse(storedFormData) as Partial<TPkiSyncForm> & {
          returnUrl?: string;
        };
        if (form.destination && (!returnUrl || returnUrl.split("?")[0] === pathname)) {
          localStorage.removeItem("pkiSyncFormData");
          setRestoredSync({
            destination: form.destination,
            initialData: { ...form, connection: { id: connectionId, name: connectionName } }
          });
          setIsAddSyncOpen(true);
        }
      } catch {
        localStorage.removeItem("pkiSyncFormData");
        setRestoredSync(null);
      }
    }

    navigate({ to: pathname, search: { selectedTab: ApplicationTab.Syncs }, replace: true });
  }, [connectionId, connectionName]);

  const { subscription } = useSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  // Every sync destination is enterprise, so refuse here rather than after the destination picker.
  const handleAddSync = () => {
    if (!subscription.pkiSyncs) {
      openUpgradeGate({
        intent: CertificateSyncsUpgradeIntent,
        paywallKey: "cert-manager.application-syncs"
      });
      return;
    }
    setIsAddSyncOpen(true);
  };

  const { data, isPending } = useListPkiSyncs(projectId, {
    enabled: Boolean(projectId),
    refetchInterval: 30000,
    applicationId
  });

  const { data: permissionData } = useGetPkiApplicationPermissions(applicationId);
  const canCreateSync = Boolean(
    permissionData?.permission?.can(
      PkiApplicationResourceActions.Create,
      PkiApplicationResourceSub.PkiSyncs
    )
  );

  const applicationSyncs = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Certificate Syncs
          <DocumentationLinkBadge href={PkiDocsUrls.applications.syncs.overview} />
        </CardTitle>
        <CardDescription>
          Push certificates from this application out to AWS ACM, Cloudflare, Azure Key Vault, and
          other destinations.
        </CardDescription>
        <CardAction>
          <Button variant="outline" onClick={handleAddSync} isDisabled={!canCreateSync}>
            <PlusIcon />
            Add Sync
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <PageLoader />
        ) : (
          <PkiSyncsTable pkiSyncs={applicationSyncs} applicationName={applicationName} />
        )}
      </CardContent>
      <CreatePkiSyncModal
        isOpen={isAddSyncOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) setRestoredSync(null);
          setIsAddSyncOpen(isOpen);
        }}
        selectSync={restoredSync?.destination ?? null}
        initialData={restoredSync?.initialData}
        applicationId={applicationId}
      />
      {upgradeGate}
    </Card>
  );
};
