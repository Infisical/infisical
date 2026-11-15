import { createContext, useContext } from "react";

import {
  ProjectPermissionPkiSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub
} from "@app/hooks/api/pkiApplications/types";
import type { PkiSync } from "@app/hooks/api/pkiSyncs/enums";
import type { TPkiSync } from "@app/hooks/api/pkiSyncs/types";

import { useProjectPermission } from "../../../access/permissions";
import { useV4Adapter } from "../../../data/adapters";

export type PkiSyncScope = {
  orgId: string;
  projectId: string;
  applicationId?: string;
  /** The page's v4 href; a connection created through a provider redirect returns here. */
  returnTo?: string;
};

export const PKI_SYNC_DRAFT_STORAGE_KEY = "v4-pki-sync-draft";

const PkiSyncScopeContext = createContext<PkiSyncScope | null>(null);

export const PkiSyncScopeProvider = PkiSyncScopeContext.Provider;

export const usePkiSyncScope = () => {
  const scope = useContext(PkiSyncScopeContext);
  if (!scope) throw new Error("usePkiSyncScope needs a PkiSyncScopeProvider");
  return scope;
};

export const PKI_SYNC_DOCS =
  "https://infisical.com/docs/documentation/platform/pki/applications/certificate-syncs";

export const pkiSyncDocs = (destination?: PkiSync) =>
  destination ? `${PKI_SYNC_DOCS}/${destination}` : `${PKI_SYNC_DOCS}/overview`;

export const destinationNameOf = (destination: PkiSync) =>
  PKI_SYNC_MAP[destination]?.name ?? destination;

export const usePkiSyncOption = (destination: PkiSync) => {
  const { data, isPending } = useV4Adapter("pkiSyncs").useSyncOptions();
  return { syncOption: data?.find((option) => option.destination === destination), isPending };
};

const useApplicationAbility = (applicationId?: string | null) =>
  useV4Adapter("pkiApplications").useApplicationPermissions(applicationId ?? "").data?.permission;

const useCanPerformSyncAction = (
  action: PkiApplicationResourceActions,
  projectAction: ProjectPermissionPkiSyncActions,
  applicationId?: string | null
) => {
  const { projectId } = usePkiSyncScope();
  const { permission } = useProjectPermission(projectId);
  const appAbility = useApplicationAbility(applicationId);
  if (!applicationId) return permission.can(projectAction, ProjectPermissionSub.PkiSyncs);
  return Boolean(appAbility?.can(action, PkiApplicationResourceSub.PkiSyncs));
};

export const useCanSetPostSyncCommand = (applicationId?: string | null) =>
  useCanPerformSyncAction(
    PkiApplicationResourceActions.SetPostSyncCommand,
    ProjectPermissionPkiSyncActions.SetPostSyncCommand,
    applicationId
  );

export const useCanSetTargetHost = (applicationId?: string | null) =>
  useCanPerformSyncAction(
    PkiApplicationResourceActions.SetTargetHost,
    ProjectPermissionPkiSyncActions.SetTargetHost,
    applicationId
  );

export const useCanSetHealthCheckCommand = (applicationId?: string | null) =>
  useCanPerformSyncAction(
    PkiApplicationResourceActions.SetHealthCheckCommand,
    ProjectPermissionPkiSyncActions.SetHealthCheckCommand,
    applicationId
  );

export type PkiSyncPermissions = {
  canRead: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canTriggerSync: boolean;
  canImportCertificates: boolean;
  canRemoveCertificates: boolean;
};

export const usePkiSyncPermissions = (
  pkiSync: Pick<TPkiSync, "projectId" | "applicationId">
): PkiSyncPermissions & { isPending: boolean } => {
  const { permission, isPending } = useProjectPermission(pkiSync.projectId);
  const appAbility = useApplicationAbility(pkiSync.applicationId);
  const can = (
    projectAction: ProjectPermissionPkiSyncActions,
    appAction: PkiApplicationResourceActions
  ) =>
    permission.can(projectAction, ProjectPermissionSub.PkiSyncs) ||
    Boolean(appAbility?.can(appAction, PkiApplicationResourceSub.PkiSyncs));
  return {
    isPending,
    canRead: can(ProjectPermissionPkiSyncActions.Read, PkiApplicationResourceActions.Read),
    canEdit: can(ProjectPermissionPkiSyncActions.Edit, PkiApplicationResourceActions.Edit),
    canDelete: can(ProjectPermissionPkiSyncActions.Delete, PkiApplicationResourceActions.Delete),
    canTriggerSync: can(
      ProjectPermissionPkiSyncActions.SyncCertificates,
      PkiApplicationResourceActions.SyncCertificates
    ),
    canImportCertificates: can(
      ProjectPermissionPkiSyncActions.ImportCertificates,
      PkiApplicationResourceActions.ImportCertificates
    ),
    canRemoveCertificates: can(
      ProjectPermissionPkiSyncActions.RemoveCertificates,
      PkiApplicationResourceActions.RemoveCertificates
    )
  };
};
