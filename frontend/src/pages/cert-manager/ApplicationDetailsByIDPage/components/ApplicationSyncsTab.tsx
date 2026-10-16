import { useState } from "react";
import { PlusIcon } from "lucide-react";

import { CertificateSyncsUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import { CreatePkiSyncModal } from "@app/components/pki-syncs";
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
import { useListPkiSyncs } from "@app/hooks/api/pkiSyncs";

import { PkiSyncsTable } from "../../IntegrationsListPage/components/PkiSyncsTab/PkiSyncTable";
import { PkiDocsUrls } from "../../pki-docs-urls";

type Props = { applicationId: string; applicationName: string; projectId: string };

export const ApplicationSyncsTab = ({ applicationId, applicationName, projectId }: Props) => {
  const [isAddSyncOpen, setIsAddSyncOpen] = useState(false);
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
        onOpenChange={setIsAddSyncOpen}
        applicationId={applicationId}
      />
      {upgradeGate}
    </Card>
  );
};
