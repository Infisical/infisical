import { TFolderAccess } from "@app/hooks/api/folderAccess";
import {
  TFolderAccessActor,
  toIdentityActor,
  toUserActor
} from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";

import { TFolderAccessSectionActor } from "./types";

// the member and identity pages do not load project roles, so the actor carries none
export const toFolderAccessActor = (
  actor: TFolderAccessSectionActor,
  access: TFolderAccess | null = null,
  inheritedAccess: TFolderAccess | null = null
): TFolderAccessActor => {
  if (actor.type === "user")
    return toUserActor({
      userId: actor.id,
      username: actor.username,
      email: actor.email,
      firstName: actor.firstName,
      lastName: actor.lastName,
      membership: { id: actor.membershipId, isProjectAdmin: false, roles: [] },
      folderRBACAccess: access,
      inheritedFolderRBACAccess: inheritedAccess
    });
  return toIdentityActor({
    identityId: actor.id,
    name: actor.name,
    membership: { id: null, isProjectAdmin: false, roles: [] },
    folderRBACAccess: access,
    inheritedFolderRBACAccess: inheritedAccess
  });
};
