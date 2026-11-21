import { Alert } from "@infisical/cipher/ui/alert";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { Stack } from "@infisical/cipher/ui/layout";

import {
  ProjectPermissionPkiSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub
} from "@app/hooks/api/pkiApplications/types";
import type { TPkiSync } from "@app/hooks/api/pkiSyncs/types";
import { isRemovedFromSyncDestination } from "@app/pages/cert-manager/CertificatesPage/components/CertificatesTable.utils";

import { useProjectPermission } from "../../access/permissions";
import { useV4Adapter } from "../../data/adapters";
import { destinationNameOf } from "./pki-syncs/shared";

export const useCertificateHoldingSyncs = ({
  projectId,
  certificateId,
  applicationId,
  isEnabled
}: {
  projectId: string;
  certificateId?: string;
  applicationId?: string | null;
  isEnabled: boolean;
}) => {
  const { permission } = useProjectPermission(projectId);
  const { data: appPermission } = useV4Adapter("pkiApplications").useApplicationPermissions(
    applicationId ?? ""
  );
  const canReadSyncs =
    permission.can(ProjectPermissionPkiSyncActions.Read, ProjectPermissionSub.PkiSyncs) ||
    Boolean(
      applicationId &&
      appPermission?.permission?.can(
        PkiApplicationResourceActions.Read,
        PkiApplicationResourceSub.PkiSyncs
      )
    );
  const isQueryEnabled = isEnabled && Boolean(projectId) && Boolean(certificateId) && canReadSyncs;
  const { data: syncs = [], isPending } = useV4Adapter("pkiSyncs").useSyncsWithCertificate(
    projectId,
    certificateId ?? "",
    { enabled: isQueryEnabled },
    applicationId ?? undefined
  );
  return {
    holdingSyncs: syncs.filter((sync) => sync.hasCertificate),
    isLoadingHoldingSyncs: isQueryEnabled && isPending
  };
};

const columns: DataTableColumn<TPkiSync>[] = [
  {
    id: "name",
    header: "Certificate sync",
    primary: true,
    grow: true,
    minWidth: 120,
    wrap: true,
    text: (sync) => sync.name,
    render: (sync) => sync.name
  },
  {
    id: "destination",
    header: "Destination",
    width: 130,
    wrap: true,
    text: (sync) => destinationNameOf(sync.destination),
    render: (sync) => destinationNameOf(sync.destination)
  },
  {
    id: "removal",
    header: "Removal",
    width: 100,
    text: (sync) => (isRemovedFromSyncDestination(sync) ? "On" : "Off"),
    render: (sync) => (isRemovedFromSyncDestination(sync) ? "On" : "Off")
  }
];

export const CertificateSyncImpact = ({ holdingSyncs }: { holdingSyncs: TPkiSync[] }) =>
  holdingSyncs.length ? (
    <Stack gap={12}>
      <Alert tone="warn" title="The following certificate syncs will be affected by this change">
        Where removal is on, the sync deletes this certificate from its destination.
      </Alert>
      <DataTable
        label="Affected certificate syncs"
        rows={holdingSyncs}
        columns={columns}
        getRowId={(sync) => sync.id}
        rowLabel={(sync) => sync.name}
      />
    </Stack>
  ) : null;
