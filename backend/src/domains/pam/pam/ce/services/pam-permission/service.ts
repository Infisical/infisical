import { ProjectType, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import {
  ProjectResourcePermission,
  TProjectResourcePermissionService,
  TResourceRef
} from "@app/domains/platform/projects/ce/module";

import { PamAccountRoles, PamFolderRoles } from "../../models/pam-resource-roles";
import { PamResourcePermissionSet } from "../../models/pam-roles";

export type TGetPamPermissionInput = {
  actor: TActorContext;
  projectId: string;
  folderId?: string | null;
  accountId?: string;
};

export type TPamPermissionService = {
  // What the actor may do on a PAM folder, an account, or an account in a folder: the roles it holds on either,
  // together. isProjectAdmin on the result is the product admin, who gets nothing on a resource it holds no role on.
  getPamPermission(input: TGetPamPermissionInput): Promise<ProjectResourcePermission<PamResourcePermissionSet>>;
};

export class PamPermissionService implements TPamPermissionService {
  private readonly folderRoles = new PamFolderRoles();

  private readonly accountRoles = new PamAccountRoles();

  constructor(private readonly projectResourcePermissionService: TProjectResourcePermissionService) {}

  getPamPermission({
    actor,
    projectId,
    folderId,
    accountId
  }: TGetPamPermissionInput): Promise<ProjectResourcePermission<PamResourcePermissionSet>> {
    const resources: TResourceRef[] = [];
    if (folderId) resources.push({ resourceType: ResourceType.PamFolder, resourceId: folderId });
    if (accountId) resources.push({ resourceType: ResourceType.PamAccount, resourceId: accountId });
    return this.projectResourcePermissionService.getResourcePermission<PamResourcePermissionSet>({
      actor,
      projectId,
      type: ProjectType.PAM,
      resources,
      roles: accountId ? this.accountRoles : this.folderRoles
    });
  }
}
