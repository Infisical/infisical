import fs from "fs";
import path from "path";
import { Types } from "mongoose";
import { IOrganization, ISecret, IUser, Membership } from "../models";
import { validateMembership } from "../helpers/membership";
import _ from "lodash";
import { BadRequestError, UnauthorizedRequestError, ValidationError } from "../utils/errors";
import { validateMembershipOrg } from "../helpers/membershipOrg";
import { PERMISSION_READ_SECRETS, PERMISSION_WRITE_SECRETS } from "../variables";
import { AuthMethod } from "../models";
import { z } from "zod";

/**
 * Validate that email [email] is not disposable
 * @param email - email to validate
 */
export const validateUserEmail = (email: string) => {
  const emailDomain = email.split("@")[1];
  const disposableEmails = fs
    .readFileSync(path.resolve(__dirname, "../data/" + "disposable_emails.txt"), "utf8")
    .split("\n");

  if (disposableEmails.includes(emailDomain))
    throw ValidationError({
      message: "Failed to validate email as non-disposable"
    });
};

/**
 * Validate that user (client) can access workspace
 * with id [workspaceId] and its environment [environment] with required permissions
 * [requiredPermissions]
 * @param {Object} obj
 * @param {User} obj.user - user client
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to validate against
 * @param {String} environment - (optional) environment in workspace to validate against
 * @param {String[]} requiredPermissions - required permissions as part of the endpoint
 */
export const validateUserClientForWorkspace = async ({
  user,
  workspaceId,
  environment,
  acceptedRoles,
  requiredPermissions
}: {
  user: IUser;
  workspaceId: Types.ObjectId;
  environment?: string;
  acceptedRoles: Array<"admin" | "member">;
  requiredPermissions?: string[];
}) => {
  // validate user membership in workspace
  const membership = await validateMembership({
    userId: user._id,
    workspaceId,
    acceptedRoles
  });

  let runningIsDisallowed = false;
  requiredPermissions?.forEach((requiredPermission: string) => {
    switch (requiredPermission) {
      case PERMISSION_READ_SECRETS:
        runningIsDisallowed = _.some(membership.deniedPermissions, {
          environmentSlug: environment,
          ability: PERMISSION_READ_SECRETS
        });
        break;
      case PERMISSION_WRITE_SECRETS:
        runningIsDisallowed = _.some(membership.deniedPermissions, {
          environmentSlug: environment,
          ability: PERMISSION_WRITE_SECRETS
        });
        break;
      default:
        break;
    }

    if (runningIsDisallowed) {
      throw UnauthorizedRequestError({
        message: `Failed permissions authorization for workspace environment action : ${requiredPermission}`
      });
    }
  });

  return membership;
};

/**
 * Validate that user (client) can access secret [secret]
 * with required permissions [requiredPermissions]
 * @param {Object} obj
 * @param {User} obj.user - user client
 * @param {Secret[]} obj.secrets - secrets to validate against
 * @param {String[]} requiredPermissions - required permissions as part of the endpoint
 */
export const validateUserClientForSecret = async ({
  user,
  secret,
  acceptedRoles,
  requiredPermissions
}: {
  user: IUser;
  secret: ISecret;
  acceptedRoles?: Array<"admin" | "member">;
  requiredPermissions?: string[];
}) => {
  const membership = await validateMembership({
    userId: user._id,
    workspaceId: secret.workspace,
    acceptedRoles
  });

  if (requiredPermissions?.includes(PERMISSION_WRITE_SECRETS)) {
    const isDisallowed = _.some(membership.deniedPermissions, {
      environmentSlug: secret.environment,
      ability: PERMISSION_WRITE_SECRETS
    });

    if (isDisallowed) {
      throw UnauthorizedRequestError({
        message: "You do not have the required permissions to perform this action"
      });
    }
  }
};

/**
 * Validate that user (client) can access secrets [secrets]
 * with required permissions [requiredPermissions]
 * @param {Object} obj
 * @param {User} obj.user - user client
 * @param {Secret[]} obj.secrets - secrets to validate against
 * @param {String[]} requiredPermissions - required permissions as part of the endpoint
 */
export const validateUserClientForSecrets = async ({
  user,
  secrets,
  requiredPermissions
}: {
  user: IUser;
  secrets: ISecret[];
  requiredPermissions?: string[];
}) => {
  // TODO: add acceptedRoles?

  const userMemberships = await Membership.find({ user: user._id });
  const userMembershipById = _.keyBy(userMemberships, "workspace");
  const workspaceIdsSet = new Set(userMemberships.map((m) => m.workspace.toString()));

  // for each secret check if the secret belongs to a workspace the user is a member of
  secrets.forEach((secret: ISecret) => {
    if (!workspaceIdsSet.has(secret.workspace.toString())) {
      throw BadRequestError({
        message: "Failed authorization for the secret"
      });
    }

    if (requiredPermissions?.includes(PERMISSION_WRITE_SECRETS)) {
      const deniedMembershipPermissions =
        userMembershipById[secret.workspace.toString()].deniedPermissions;
      const isDisallowed = _.some(deniedMembershipPermissions, {
        environmentSlug: secret.environment,
        ability: PERMISSION_WRITE_SECRETS
      });

      if (isDisallowed) {
        throw UnauthorizedRequestError({
          message: "You do not have the required permissions to perform this action"
        });
      }
    }
  });
};

/**
 * Validate that user (client) can access organization [organization]
 * @param {Object} obj
 * @param {User} obj.user - user client
 * @param {Organization} obj.organization - organization to validate against
 */
export const validateUserClientForOrganization = async ({
  user,
  organization,
  acceptedRoles,
  acceptedStatuses
}: {
  user: IUser;
  organization: IOrganization;
  acceptedRoles: Array<"owner" | "admin" | "member">;
  acceptedStatuses: Array<"invited" | "accepted">;
}) => {
  const membershipOrg = await validateMembershipOrg({
    userId: user._id,
    organizationId: organization._id,
    acceptedRoles,
    acceptedStatuses
  });

  return membershipOrg;
};

export const UpdateMyMfaEnabledV2 = z.object({
  body: z.object({
    isMfaEnabled: z.boolean()
  })
});

export const UpdateNameV2 = z.object({
  body: z.object({
    firstName: z.string().trim(),
    lastName: z.string().trim()
  })
});

export const UpdateAuthMethodsV2 = z.object({
  body: z.object({
    authMethods: z.nativeEnum(AuthMethod).array().min(1)
  })
});

export const CreateApiKeyV2 = z.object({
  body: z.object({
    name: z.string().trim(),
    expiresIn: z.number()
  })
});

export const DeleteApiKeyV2 = z.object({
  params: z.object({
    apiKeyDataId: z.string().trim()
  })
});
