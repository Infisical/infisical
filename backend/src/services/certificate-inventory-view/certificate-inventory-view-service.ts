import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";

import { TPermissionServiceFactory } from "../../ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub
} from "../../ee/services/permission/project-permission";
import { TCertificateInventoryViewDALFactory } from "./certificate-inventory-view-dal";
import {
  TCreateInventoryViewDTO,
  TDeleteInventoryViewDTO,
  TListInventoryViewsDTO,
  TUpdateInventoryViewDTO
} from "./certificate-inventory-view-types";

type TSystemViewFilters = {
  status?: string[];
  notAfterTo?: string;
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
  { id: "system-all", name: "All Certificates", filters: {}, columns: null, isSystem: true, createdByUserId: null },
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
  }
];

type TCertificateInventoryViewServiceFactoryDep = {
  certificateInventoryViewDAL: TCertificateInventoryViewDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateInventoryViewServiceFactory = ReturnType<typeof certificateInventoryViewServiceFactory>;

export const certificateInventoryViewServiceFactory = ({
  certificateInventoryViewDAL,
  permissionService
}: TCertificateInventoryViewServiceFactoryDep) => {
  const checkProjectPermission = async (
    dto: Pick<TProjectPermission, "actor" | "actorId" | "actorOrgId" | "actorAuthMethod"> & { projectId: string },
    action: ProjectPermissionCertificateActions = ProjectPermissionCertificateActions.Read
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: dto.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.Certificates);

    return permission;
  };

  const listViews = async ({ projectId, actor, actorId, actorOrgId, actorAuthMethod }: TListInventoryViewsDTO) => {
    await checkProjectPermission({ projectId, actor, actorId, actorOrgId, actorAuthMethod });

    const customViews = await certificateInventoryViewDAL.findByProjectId(projectId, actorId);

    return {
      systemViews: SYSTEM_VIEWS,
      customViews: customViews.map((v) => ({
        ...v,
        isSystem: false as const
      }))
    };
  };

  const createView = async ({
    projectId,
    name,
    filters,
    columns,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TCreateInventoryViewDTO) => {
    await checkProjectPermission(
      { projectId, actor, actorId, actorOrgId, actorAuthMethod },
      ProjectPermissionCertificateActions.Edit
    );

    const view = await certificateInventoryViewDAL.create({
      projectId,
      name,
      filters: JSON.stringify(filters),
      columns: columns ? JSON.stringify(columns) : undefined,
      createdByUserId: actorId
    });

    return view;
  };

  const updateView = async ({
    viewId,
    projectId,
    name,
    filters,
    columns,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TUpdateInventoryViewDTO) => {
    await checkProjectPermission(
      { projectId, actor, actorId, actorOrgId, actorAuthMethod },
      ProjectPermissionCertificateActions.Edit
    );

    const existing = await certificateInventoryViewDAL.findById(viewId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: "View not found" });
    }

    if (existing.createdByUserId !== actorId) {
      throw new BadRequestError({ message: "You can only update your own views" });
    }

    const view = await certificateInventoryViewDAL.updateById(viewId, {
      ...(name !== undefined && { name }),
      ...(filters !== undefined && { filters: JSON.stringify(filters) }),
      ...(columns !== undefined && { columns: columns ? JSON.stringify(columns) : null })
    });

    return view;
  };

  const deleteView = async ({
    viewId,
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TDeleteInventoryViewDTO) => {
    await checkProjectPermission(
      { projectId, actor, actorId, actorOrgId, actorAuthMethod },
      ProjectPermissionCertificateActions.Edit
    );

    const existing = await certificateInventoryViewDAL.findById(viewId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: "View not found" });
    }

    if (existing.createdByUserId !== actorId) {
      throw new BadRequestError({ message: "You can only delete your own views" });
    }

    await certificateInventoryViewDAL.deleteById(viewId);

    return existing;
  };

  return {
    listViews,
    createView,
    updateView,
    deleteView
  };
};
