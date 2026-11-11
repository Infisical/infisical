import { ProjectType } from "@app/db/schemas";
import { ApplicationPermissionSub, TCertManagerDomain } from "@app/domains/certificates/cert-manager/ce/module";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { TActorInput } from "@app/lib/types";

import { NON_PQC_KEY_ALGORITHMS, PQC_KEY_ALGORITHMS } from "../certificate/certificate-dal";
import { CertStatus } from "../certificate/certificate-types";
import { TPkiApplicationDALFactory } from "../pki-application/pki-application-dal";
import { TCertificateInventoryViewDALFactory } from "./certificate-inventory-view-dal";
import {
  TCreateInventoryViewDTO,
  TDeleteInventoryViewDTO,
  TListInventoryViewsDTO,
  TUpdateInventoryViewDTO
} from "./certificate-inventory-view-types";

type TSystemViewFilters = {
  status?: string[];
  includeDeleted?: boolean;
  notAfterTo?: string;
  keyAlgorithm?: string[];
};

type TSystemView = {
  id: string;
  name: string;
  filters: TSystemViewFilters;
  columns: null;
  isSystem: true;
  createdByUserId: null;
};

const SYSTEM_VIEWS: TSystemView[] = [
  { id: "system-default", name: "Default", filters: {}, columns: null, isSystem: true, createdByUserId: null },
  {
    id: "system-all",
    name: "All Certificates",
    filters: { includeDeleted: true },
    columns: null,
    isSystem: true,
    createdByUserId: null
  },
  {
    id: "system-expiring-7d",
    name: "Expiring in 7 days",
    filters: { status: ["active"], notAfterTo: "+7d" },
    columns: null,
    isSystem: true,
    createdByUserId: null
  },
  {
    id: "system-expiring-30d",
    name: "Expiring in 30 days",
    filters: { status: ["active"], notAfterTo: "+30d" },
    columns: null,
    isSystem: true,
    createdByUserId: null
  },
  {
    id: "system-renewed",
    name: "Renewed",
    filters: { status: ["renewed"] },
    columns: null,
    isSystem: true,
    createdByUserId: null
  },
  {
    id: "system-expired",
    name: "Expired",
    filters: { status: ["expired"] },
    columns: null,
    isSystem: true,
    createdByUserId: null
  },
  {
    id: "system-revoked",
    name: "Revoked",
    filters: { status: ["revoked"] },
    columns: null,
    isSystem: true,
    createdByUserId: null
  },
  {
    id: "system-deleted",
    name: "Deleted",
    filters: { status: [CertStatus.DELETED] },
    columns: null,
    isSystem: true,
    createdByUserId: null
  },
  {
    id: "system-pqc",
    name: "Post-Quantum (PQC)",
    filters: { keyAlgorithm: PQC_KEY_ALGORITHMS },
    columns: null,
    isSystem: true,
    createdByUserId: null
  },
  {
    id: "system-non-pqc",
    name: "Classical (Non-PQC)",
    filters: { keyAlgorithm: NON_PQC_KEY_ALGORITHMS },
    columns: null,
    isSystem: true,
    createdByUserId: null
  }
];

type TCertificateInventoryViewServiceFactoryDep = {
  certificateInventoryViewDAL: TCertificateInventoryViewDALFactory;
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  certManagerDomain: Pick<TCertManagerDomain, "getApplicationPermission">;
};

export type TCertificateInventoryViewServiceFactory = ReturnType<typeof certificateInventoryViewServiceFactory>;

export const certificateInventoryViewServiceFactory = ({
  certificateInventoryViewDAL,
  pkiApplicationDAL,
  projectsDomain,
  certManagerDomain
}: TCertificateInventoryViewServiceFactoryDep) => {
  const assertCanActOnView = async (
    dto: TActorInput & {
      projectId: string;
      applicationId?: string | null;
    },
    action: ProjectPermissionActions = ProjectPermissionActions.Read
  ) => {
    if (dto.applicationId) {
      const permission = await certManagerDomain.getApplicationPermission({
        actor: dto.actor,
        projectId: dto.projectId,
        applicationId: dto.applicationId
      });
      permission.assert({ action, subject: ApplicationPermissionSub.CertificateInventoryViews });
      return;
    }
    const permission = await projectsDomain.getProjectPermission({
      actor: dto.actor,
      projectId: dto.projectId,
      type: ProjectType.CertificateManager
    });
    permission.assert({ action, subject: ProjectPermissionSub.CertificateInventoryViews });
  };

  const listViews = async ({ projectId, applicationId, actor }: TListInventoryViewsDTO) => {
    await assertCanActOnView({ projectId, applicationId, actor }, ProjectPermissionActions.Read);

    const allViews = await certificateInventoryViewDAL.findByProjectId(projectId, applicationId);

    const sharedViews = allViews.filter((v) => v.isShared);
    const customViews = allViews.filter((v) => !v.isShared);

    return {
      systemViews: SYSTEM_VIEWS,
      sharedViews: sharedViews.map((v) => ({
        ...v,
        isSystem: false as const,
        isShared: true as const
      })),
      customViews: customViews.map((v) => ({
        ...v,
        isSystem: false as const,
        isShared: false as const
      }))
    };
  };

  const $resolveApplicationName = async (applicationId?: string | null) => {
    if (!applicationId) return null;
    const application = await pkiApplicationDAL.findById(applicationId);
    return application?.name ?? null;
  };

  const createView = async ({
    projectId,
    applicationId,
    name,
    filters,
    columns,
    isShared = false,
    actor
  }: TCreateInventoryViewDTO) => {
    await assertCanActOnView({ projectId, applicationId, actor }, ProjectPermissionActions.Create);

    if (applicationId && filters?.applicationIds?.length) {
      throw new BadRequestError({
        message: "Application filter is only available on project-wide inventory views."
      });
    }

    try {
      const view = await certificateInventoryViewDAL.create({
        projectId,
        applicationId: applicationId ?? null,
        name,
        filters: JSON.stringify(filters),
        columns: columns ? JSON.stringify(columns) : undefined,
        createdByUserId: actor.principal.id,
        isShared
      });

      return { ...view, applicationName: await $resolveApplicationName(view.applicationId) };
    } catch (error) {
      if (error instanceof DatabaseError && (error.error as { code?: string })?.code === "23505") {
        throw new BadRequestError({
          message: isShared
            ? "A shared view with this name already exists in this project"
            : "You already have a view with this name"
        });
      }
      throw error;
    }
  };

  const updateView = async ({
    viewId,
    projectId,
    name,
    filters,
    columns,
    isShared,
    actor
  }: TUpdateInventoryViewDTO) => {
    const existing = await certificateInventoryViewDAL.findById(viewId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: "View not found" });
    }

    await assertCanActOnView(
      { projectId, applicationId: existing.applicationId, actor },
      ProjectPermissionActions.Edit
    );

    if (existing.createdByUserId !== actor.principal.id) {
      throw new BadRequestError({ message: "You can only update your own views" });
    }

    if (existing.applicationId && filters?.applicationIds?.length) {
      throw new BadRequestError({
        message: "Application filter is only available on project-wide inventory views."
      });
    }

    try {
      const view = await certificateInventoryViewDAL.updateById(viewId, {
        ...(name !== undefined && { name }),
        ...(filters !== undefined && { filters: JSON.stringify(filters) }),
        ...(columns !== undefined && { columns: columns ? JSON.stringify(columns) : null }),
        ...(isShared !== undefined && { isShared })
      });

      return { ...view, applicationName: await $resolveApplicationName(view.applicationId) };
    } catch (error) {
      if (error instanceof DatabaseError && (error.error as { code?: string })?.code === "23505") {
        throw new BadRequestError({
          message: isShared
            ? "A shared view with this name already exists in this project"
            : "You already have a view with this name"
        });
      }
      throw error;
    }
  };

  const deleteView = async ({ viewId, projectId, actor }: TDeleteInventoryViewDTO) => {
    const existing = await certificateInventoryViewDAL.findById(viewId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: "View not found" });
    }

    await assertCanActOnView(
      { projectId, applicationId: existing.applicationId, actor },
      ProjectPermissionActions.Delete
    );

    if (existing.createdByUserId !== actor.principal.id) {
      throw new BadRequestError({ message: "You can only delete your own views" });
    }

    await certificateInventoryViewDAL.deleteById(viewId);

    return { ...existing, applicationName: await $resolveApplicationName(existing.applicationId) };
  };

  return {
    listViews,
    createView,
    updateView,
    deleteView
  };
};
