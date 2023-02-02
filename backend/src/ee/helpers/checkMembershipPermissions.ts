import _ from "lodash";
import { Membership } from "../../models";

export const userHasWorkspaceAccess = async (userId: any, workspaceId: any, environment: any, action: any) => {
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