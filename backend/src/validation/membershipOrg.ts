import { Types } from "mongoose";
import { MembershipOrg } from "../models";
import { validateMembershipOrg } from "../helpers/membershipOrg";
import { MembershipOrgNotFoundError, UnauthorizedRequestError } from "../utils/errors";
import { AuthData } from "../interfaces/middleware";
import { ActorType } from "../ee/models";
import { z } from "zod";

/**
 * Validate authenticated clients for organization membership with id [membershipOrgId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.membershipOrgId - id of organization membership to validate against
 * @param {Array<'owner' | 'admin' | 'member'>} obj.acceptedRoles - accepted organization roles
 * @param {MembershipOrg} - validated organization membership
 */
export const validateClientForMembershipOrg = async ({
  authData,
  membershipOrgId,
  acceptedRoles,
  acceptedStatuses
}: {
  authData: AuthData;
  membershipOrgId: Types.ObjectId;
  acceptedRoles: Array<"owner" | "admin" | "member">;
  acceptedStatuses: Array<"invited" | "accepted">;
}) => {
  const membershipOrg = await MembershipOrg.findById(membershipOrgId);

  if (!membershipOrg)
    throw MembershipOrgNotFoundError({
      message: "Failed to find organization membership "
    });

  switch (authData.actor.type) {
    case ActorType.USER:
      await validateMembershipOrg({
        userId: authData.authPayload._id,
        organizationId: membershipOrg.organization,
        acceptedRoles,
        acceptedStatuses
      });

      return membershipOrg;
    case ActorType.SERVICE:
      throw UnauthorizedRequestError({
        message: "Failed service account client authorization for organization membership"
      });
  }
};

export const DelOrgMembershipv1 = z.object({
  params: z.object({
    membershipOrgId: z.string().trim()
  })
});

export const InviteUserToOrgv1 = z.object({
  body: z.object({
    inviteeEmail: z.string().trim().email(),
    organizationId: z.string().trim()
  })
});

export const VerifyUserToOrgv1 = z.object({
  body: z.object({
    email: z.string().trim().email(),
    organizationId: z.string().trim(),
    code: z.string().trim()
  })
});
