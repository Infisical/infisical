import { Types } from 'mongoose';
import _ from "lodash";
import { Membership } from "../../models";
import { ABILITY_READ, ABILITY_WRITE } from "../../variables/organization";

export const userHasWorkspaceAccess = async (userId: Types.ObjectId, workspaceId: Types.ObjectId, environment: string, action: any) => {
  const membershipForWorkspace = await Membership.findOne({ workspace: workspaceId, user: userId })
  if (!membershipForWorkspace) {
    return false
  }

  const deniedMembershipPermissions = membershipForWorkspace.deniedPermissions;
  const isDisallowed = _.some(deniedMembershipPermissions, { environmentSlug: environment, ability: action });

  if (isDisallowed) {
    return false
  }

  return true
}

export const userHasWriteOnlyAbility = async (userId: Types.ObjectId, workspaceId: Types.ObjectId, environment: string) => {
  const membershipForWorkspace = await Membership.findOne({ workspace: workspaceId, user: userId })
  if (!membershipForWorkspace) {
    return false
  }

  const deniedMembershipPermissions = membershipForWorkspace.deniedPermissions;
  const isWriteDisallowed = _.some(deniedMembershipPermissions, { environmentSlug: environment, ability: ABILITY_WRITE });
  const isReadDisallowed = _.some(deniedMembershipPermissions, { environmentSlug: environment, ability: ABILITY_READ });

  // case: you have write only if read is blocked and write is not
  if (isReadDisallowed && !isWriteDisallowed) {
    return true
  }

  return false
}

export const userHasNoAbility = async (userId: Types.ObjectId, workspaceId: Types.ObjectId, environment: string) => {
  const membershipForWorkspace = await Membership.findOne({ workspace: workspaceId, user: userId })
  if (!membershipForWorkspace) {
    return true
  }

  const deniedMembershipPermissions = membershipForWorkspace.deniedPermissions;
  const isWriteDisallowed = _.some(deniedMembershipPermissions, { environmentSlug: environment, ability: ABILITY_WRITE });
  const isReadBlocked = _.some(deniedMembershipPermissions, { environmentSlug: environment, ability: ABILITY_READ });

  if (isReadBlocked && isWriteDisallowed) {
    return true
  }

  return false
}