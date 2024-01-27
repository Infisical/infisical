import { Request, Response } from "express";
import { IUser, Membership, Workspace } from "../../../models";
import { EventType } from "../../../ee/models";
import { IMembershipPermission } from "../../../models/membership";
import { BadRequestError, UnauthorizedRequestError } from "../../../utils/errors";
import { ADMIN, MEMBER } from "../../../variables/organization";
import { PERMISSION_READ_SECRETS, PERMISSION_WRITE_SECRETS } from "../../../variables";
import _ from "lodash";
import { EEAuditLogService } from "../../services";

export const denyMembershipPermissions = async (req: Request, res: Response) => {
  const { membershipId } = req.params;
  const { permissions } = req.body;
  const sanitizedMembershipPermissions: IMembershipPermission[] = permissions.map((permission: IMembershipPermission) => {
    if (!permission.ability || !permission.environmentSlug || ![PERMISSION_READ_SECRETS, PERMISSION_WRITE_SECRETS].includes(permission.ability)) {
      throw BadRequestError({ message: "One or more required fields are missing from the request or have incorrect type" })
    }

    return {
      environmentSlug: permission.environmentSlug,
      ability: permission.ability
    }
  })

  const sanitizedMembershipPermissionsUnique = _.uniqWith(sanitizedMembershipPermissions, _.isEqual)

  const membershipToModify = await Membership.findById(membershipId)
  if (!membershipToModify) {
    throw BadRequestError({ message: "Unable to locate resource" })
  }

  // check if the user making the request is a admin of this project 
  if (![ADMIN, MEMBER].includes(membershipToModify.role)) {
    throw UnauthorizedRequestError()
  }

  // check if the requested slugs are indeed a part of this related workspace 
  const relatedWorkspace = await Workspace.findById(membershipToModify.workspace)
  if (!relatedWorkspace) {
    throw BadRequestError({ message: "Something went wrong when locating the related workspace" })
  }

  const uniqueEnvironmentSlugs = new Set(_.uniq(_.map(relatedWorkspace.environments, "slug")));

  sanitizedMembershipPermissionsUnique.forEach(permission => {
    if (!uniqueEnvironmentSlugs.has(permission.environmentSlug)) {
      throw BadRequestError({ message: "Unknown environment slug reference" })
    }
  })

  // update the permissions 
  const updatedMembershipWithPermissions = await Membership.findByIdAndUpdate(
    { _id: membershipToModify._id },
    { $set: { deniedPermissions: sanitizedMembershipPermissionsUnique } },
    { new: true }
  ).populate<{ user: IUser }>("user");

  if (!updatedMembershipWithPermissions) {
    throw BadRequestError({ message: "The resource has been removed before it can be modified" })
  }

  await EEAuditLogService.createAuditLog(
    req.authData,
    {
      type: EventType.UPDATE_USER_WORKSPACE_DENIED_PERMISSIONS,
      metadata: {
        userId: updatedMembershipWithPermissions.user._id.toString(),
        email: updatedMembershipWithPermissions.user.email,
        deniedPermissions: updatedMembershipWithPermissions.deniedPermissions.map(({
          environmentSlug,
          ability
        }) => ({
          environmentSlug,
          ability
        }))
      }
    },
    {
      workspaceId: updatedMembershipWithPermissions.workspace
    }
  );

  res.send({
    permissionsDenied: updatedMembershipWithPermissions.deniedPermissions,
  })
}
