import { Types } from 'mongoose';
import {
    IUser,
    IServiceAccount,
    IServiceTokenData,
    Organization,
    User,
    ServiceAccount,
    ServiceTokenData
} from '../models';
import {
    AUTH_MODE_JWT,
    AUTH_MODE_SERVICE_ACCOUNT,
    AUTH_MODE_SERVICE_TOKEN,
    AUTH_MODE_API_KEY
} from '../variables';
import {
    OrganizationNotFoundError,
    UnauthorizedRequestError
} from '../utils/errors';
import { validateUserClientForOrganization } from './user';
import { validateServiceAccountClientForOrganization } from './serviceAccount';

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
  authData: {
    authMode: string;
    authPayload: IUser | IServiceAccount | IServiceTokenData;
  };
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

  if (
    authData.authMode === AUTH_MODE_JWT &&
    authData.authPayload instanceof User
  ) {
    const membershipOrg = await validateUserClientForOrganization({
      user: authData.authPayload,
      organization,
      acceptedRoles,
      acceptedStatuses,
    });

    return { organization, membershipOrg };
  }

  if (
    authData.authMode === AUTH_MODE_SERVICE_ACCOUNT &&
    authData.authPayload instanceof ServiceAccount
  ) {
    await validateServiceAccountClientForOrganization({
      serviceAccount: authData.authPayload,
      organization,
    });

    return { organization };
  }

  if (
    authData.authMode === AUTH_MODE_SERVICE_TOKEN &&
    authData.authPayload instanceof ServiceTokenData
  ) {
    throw UnauthorizedRequestError({
      message: "Failed service token authorization for organization",
    });
  }

  if (
    authData.authMode === AUTH_MODE_API_KEY &&
    authData.authPayload instanceof User
  ) {
    const membershipOrg = await validateUserClientForOrganization({
      user: authData.authPayload,
      organization,
      acceptedRoles,
      acceptedStatuses,
    });

    return { organization, membershipOrg };
  }

  throw UnauthorizedRequestError({
    message: "Failed client authorization for organization",
  });
};