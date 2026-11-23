import { ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PamResourcePermissionActions, TPamPermissionService } from "@app/domains/pam/pam/ce/module";
import { TProjectPermissionService } from "@app/domains/platform/projects/ce/module";

type TPamDep = Pick<TPamPermissionService, "getPamPermission" | "assertAccountAccess" | "canAccessAccount">;
type TProjectsDep = Pick<TProjectPermissionService, "getProjectPermission">;
export const verifyProductMembership = (
  projectPermissionService: TProjectsDep,
  projectId: string,
  ctx: TActorContext
) => projectPermissionService.getProjectPermission({ actor: ctx, projectId, type: ProjectType.PAM });

export const checkFolderPermission = (
  pamPermissionService: TPamDep,
  folderId: string,
  projectId: string,
  ctx: TActorContext
) => pamPermissionService.getPamPermission({ actor: ctx, projectId, folderId });

export const checkAccountAccess = (
  pamPermissionService: TPamDep,
  accountId: string,
  folderId: string | null | undefined,
  projectId: string,
  action: PamResourcePermissionActions,
  ctx: TActorContext
) => pamPermissionService.assertAccountAccess({ actor: ctx, projectId, accountId, folderId, action });

export const accountAccessAllows = (
  pamPermissionService: TPamDep,
  accountId: string,
  folderId: string | null | undefined,
  projectId: string,
  action: PamResourcePermissionActions,
  ctx: TActorContext
) => pamPermissionService.canAccessAccount({ actor: ctx, projectId, accountId, folderId, action });
