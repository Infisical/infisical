import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";

import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  useGetPkiApplicationPermissions
} from "../pkiApplications";
import { TPkiSync } from "./types";

export const usePkiSyncPermissions = (pkiSync: TPkiSync) => {
  const { permission: projectPermission } = useProjectPermission();
  const { data: appPermissionData } = useGetPkiApplicationPermissions(pkiSync.applicationId ?? "");
  const appPermission = appPermissionData?.permission;

  const checkApp = (action: PkiApplicationResourceActions) =>
    Boolean(appPermission?.can(action, PkiApplicationResourceSub.PkiSyncs));

  return {
    canRead:
      projectPermission.can(ProjectPermissionPkiSyncActions.Read, ProjectPermissionSub.PkiSyncs) ||
      checkApp(PkiApplicationResourceActions.Read),
    canEdit:
      projectPermission.can(ProjectPermissionPkiSyncActions.Edit, ProjectPermissionSub.PkiSyncs) ||
      checkApp(PkiApplicationResourceActions.Edit),
    canDelete:
      projectPermission.can(
        ProjectPermissionPkiSyncActions.Delete,
        ProjectPermissionSub.PkiSyncs
      ) || checkApp(PkiApplicationResourceActions.Delete),
    canTriggerSync:
      projectPermission.can(
        ProjectPermissionPkiSyncActions.SyncCertificates,
        ProjectPermissionSub.PkiSyncs
      ) || checkApp(PkiApplicationResourceActions.SyncCertificates),
    canImportCertificates:
      projectPermission.can(
        ProjectPermissionPkiSyncActions.ImportCertificates,
        ProjectPermissionSub.PkiSyncs
      ) || checkApp(PkiApplicationResourceActions.ImportCertificates),
    canRemoveCertificates:
      projectPermission.can(
        ProjectPermissionPkiSyncActions.RemoveCertificates,
        ProjectPermissionSub.PkiSyncs
      ) || checkApp(PkiApplicationResourceActions.RemoveCertificates)
  };
};
