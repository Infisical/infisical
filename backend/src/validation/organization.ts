import { Types } from "mongoose";
import {
    IUser,
    Organization,
} from "../models";
import {
    OrganizationNotFoundError,
    UnauthorizedRequestError,
} from "../utils/errors";
import { validateUserClientForOrganization } from "./user";
import { AuthData } from "../interfaces/middleware";
import { ActorType } from "../ee/models";

/**
 * Validate accepted clients for organization with id [organizationId]
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.organizationId - id of organization to validate against
 */
export const validateClientForOrganization = async ({
  authData,
  organizationId,
  acceptedRoles,
  acceptedStatuses,
}: {
  authData: AuthData;
  organizationId: Types.ObjectId;
  acceptedRoles: Array<"owner" | "admin" | "member">;
  acceptedStatuses: Array<"invited" | "accepted">;
}) => {
  const organization = await Organization.findById(organizationId);

  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization",
    });
  }
  
  let membershipOrg;
  switch (authData.actor.type) {
    case ActorType.USER:
      membershipOrg = await validateUserClientForOrganization({
        user: authData.authPayload as IUser,
        organization,
        acceptedRoles,
        acceptedStatuses,
      });

      return { organization, membershipOrg }; 
    case ActorType.SERVICE:
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for organization",
      });
  }
};