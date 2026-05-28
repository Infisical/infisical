import { useState } from "react";
import { PlusIcon } from "lucide-react";

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
          <Button
            variant="outline"
            onClick={() => setIsAddSyncOpen(true)}
            isDisabled={!canCreateSync}
          >
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
    </Card>
  );
};
