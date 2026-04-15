import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectPermission } from "@app/lib/types";

import { TPermissionServiceFactory } from "../../ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "../../ee/services/permission/project-permission";
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
    action: ProjectPermissionActions = ProjectPermissionActions.Read
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.actor,
      actorId: dto.actorId,
      projectId: dto.projectId,
      actorAuthMethod: dto.actorAuthMethod,
      actorOrgId: dto.actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.CertificateInventoryViews);

    return permission;
  };

  const listViews = async ({ projectId, actor, actorId, actorOrgId, actorAuthMethod }: TListInventoryViewsDTO) => {
    await checkProjectPermission({ projectId, actor, actorId, actorOrgId, actorAuthMethod });

    const allViews = await certificateInventoryViewDAL.findByProjectId(projectId, actorId);

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

  const createView = async ({
    projectId,
    name,
    filters,
    columns,
    isShared = false,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TCreateInventoryViewDTO) => {
    await checkProjectPermission(
      { projectId, actor, actorId, actorOrgId, actorAuthMethod },
      ProjectPermissionActions.Create
    );

    try {
      const view = await certificateInventoryViewDAL.create({
        projectId,
        name,
        filters: JSON.stringify(filters),
        columns: columns ? JSON.stringify(columns) : undefined,
        createdByUserId: actorId,
        isShared
      });

      return view;
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code === "23505") {
        // unique constraint violation
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
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TUpdateInventoryViewDTO) => {
    await checkProjectPermission(
      { projectId, actor, actorId, actorOrgId, actorAuthMethod },
      ProjectPermissionActions.Edit
    );

    const existing = await certificateInventoryViewDAL.findById(viewId);
    if (!existing || existing.projectId !== projectId) {
      throw new NotFoundError({ message: "View not found" });
    }

    if (existing.createdByUserId !== actorId) {
      throw new BadRequestError({ message: "You can only update your own views" });
    }

    try {
      const view = await certificateInventoryViewDAL.updateById(viewId, {
        ...(name !== undefined && { name }),
        ...(filters !== undefined && { filters: JSON.stringify(filters) }),
        ...(columns !== undefined && { columns: columns ? JSON.stringify(columns) : null }),
        ...(isShared !== undefined && { isShared })
      });

      return view;
    } catch (error) {
      const pgError = error as { code?: string };
      if (pgError.code === "23505") {
        // unique constraint violation
        throw new BadRequestError({
          message: isShared
            ? "A shared view with this name already exists in this project"
            : "You already have a view with this name"
        });
      }
      throw error;
    }
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
      ProjectPermissionActions.Delete
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
