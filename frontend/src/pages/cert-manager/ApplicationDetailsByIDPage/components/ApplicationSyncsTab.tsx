import { useMemo, useState } from "react";
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
  PageLoader
} from "@app/components/v3";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  useGetPkiApplicationPermissions
} from "@app/hooks/api/pkiApplications";
import { useListPkiSyncs } from "@app/hooks/api/pkiSyncs";

import { PkiSyncsTable } from "../../IntegrationsListPage/components/PkiSyncsTab/PkiSyncTable";

type Props = { applicationId: string; applicationName: string; projectId: string };

export const ApplicationSyncsTab = ({ applicationId, applicationName, projectId }: Props) => {
  const [isAddSyncOpen, setIsAddSyncOpen] = useState(false);

  const { data, isPending } = useListPkiSyncs(projectId, {
    enabled: Boolean(projectId),
    refetchInterval: 30000
  });

  const { data: permissionData } = useGetPkiApplicationPermissions(applicationId);
  const canCreateSync = Boolean(
    permissionData?.permission?.can(
      PkiApplicationResourceActions.Create,
      PkiApplicationResourceSub.PkiSyncs
    )
  );

  const applicationSyncs = useMemo(
    () => (data ?? []).filter((sync) => sync.applicationId === applicationId),
    [data, applicationId]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificate Syncs</CardTitle>
        <CardDescription>
          Sync certificates issued by this Application out to AWS ACM, Cloudflare, Azure Key Vault,
          and other destinations.
        </CardDescription>
        <CardAction>
          <Button
            variant="project"
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
