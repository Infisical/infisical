import { Request, Response } from "express";
import { Membership, Workspace } from "../../../models";
import { IMembershipPermission } from "../../../models/membership";
import { BadRequestError, UnauthorizedRequestError } from "../../../utils/errors";
import { ABILITY_READ, ABILITY_WRITE, ADMIN, MEMBER } from "../../../variables/organization";
import { Builder } from "builder-pattern"
import _ from "lodash";

export const denyMembershipPermissions = async (req: Request, res: Response) => {
  const { membershipId } = req.params;
  const { permissions } = req.body;
  const sanitizedMembershipPermissions: IMembershipPermission[] = permissions.map((permission: IMembershipPermission) => {
    if (!permission.ability || !permission.environmentSlug || ![ABILITY_READ, ABILITY_WRITE].includes(permission.ability)) {
      throw BadRequestError({ message: "One or more required fields are missing from the request or have incorrect type" })
    }

    return Builder<IMembershipPermission>()
      .environmentSlug(permission.environmentSlug)
      .ability(permission.ability)
      .build();
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

  const uniqueEnvironmentSlugs = new Set(_.uniq(_.map(relatedWorkspace.environments, 'slug')));

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
  )

  if (!updatedMembershipWithPermissions) {
    throw BadRequestError({ message: "The resource has been removed before it can be modified" })
  }

  res.send({
    permissionsDenied: updatedMembershipWithPermissions.deniedPermissions
  })
}
