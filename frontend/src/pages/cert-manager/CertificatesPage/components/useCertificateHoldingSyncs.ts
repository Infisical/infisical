import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionPkiSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useGetPkiApplicationPermissions } from "@app/hooks/api/pkiApplications/queries";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub
} from "@app/hooks/api/pkiApplications/types";
import { useListPkiSyncsWithCertificate } from "@app/hooks/api/pkiSyncs/queries";

export const useCertificateHoldingSyncs = ({
  certificateId,
  applicationId,
  isEnabled
}: {
  certificateId?: string;
  applicationId?: string | null;
  isEnabled: boolean;
}) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { data: appPermissionData } = useGetPkiApplicationPermissions(applicationId ?? "");

  const canReadSyncs =
    permission.can(ProjectPermissionPkiSyncActions.Read, ProjectPermissionSub.PkiSyncs) ||
    Boolean(
      applicationId &&
      appPermissionData?.permission?.can(
        PkiApplicationResourceActions.Read,
        PkiApplicationResourceSub.PkiSyncs
      )
    );

  const projectId = currentProject?.id || "";
  const isQueryEnabled = isEnabled && Boolean(projectId) && Boolean(certificateId) && canReadSyncs;
  const { data: syncs = [], isPending } = useListPkiSyncsWithCertificate(
    projectId,
    certificateId || "",
    { enabled: isQueryEnabled },
    applicationId ?? undefined
  );

  return {
    holdingSyncs: syncs.filter((sync) => sync.hasCertificate),
    isLoadingHoldingSyncs: isQueryEnabled && isPending
  };
};
