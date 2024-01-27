import { Types } from "mongoose";
import { IServiceTokenData, IUser, Membership } from "../models";
import { validateUserClientForWorkspace } from "./user";
import { validateServiceTokenDataClientForWorkspace } from "./serviceTokenData";
import { MembershipNotFoundError } from "../utils/errors";
import { AuthData } from "../interfaces/middleware";
import { ActorType } from "../ee/models";
import { z } from "zod";

/**
 * Validate authenticated clients for membership with id [membershipId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.membershipId - id of membership to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspaceRoles
 * @returns {Membership} - validated membership
 */
export const validateClientForMembership = async ({
  authData,
  membershipId,
  acceptedRoles
}: {
  authData: AuthData;
  membershipId: Types.ObjectId;
  acceptedRoles: Array<"admin" | "member">;
}) => {
  const membership = await Membership.findById(membershipId);

  if (!membership)
    throw MembershipNotFoundError({
      message: "Failed to find membership"
    });

  switch (authData.actor.type) {
    case ActorType.USER:
      await validateUserClientForWorkspace({
        user: authData.authPayload as IUser,
        workspaceId: membership.workspace,
        acceptedRoles
      });

      return membership;
    case ActorType.SERVICE:
      await validateServiceTokenDataClientForWorkspace({
        serviceTokenData: authData.authPayload as IServiceTokenData,
        workspaceId: new Types.ObjectId(membership.workspace)
      });

      return membership;
  }
};

export const ValidateMembershipV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const DeleteMembershipV1 = z.object({
  params: z.object({
    membershipId: z.string().trim()
  })
});

export const ChangeMembershipRoleV1 = z.object({
  body: z.object({
    role: z.string().trim()
  }),
  params: z.object({ membershipId: z.string().trim() })
});

export const DenyMembershipPermissionV1 = z.object({
  params: z.object({
    membershipId: z.string().trim()
  }),
  body: z.object({
    permissions: z.object({}).array()
  })
});

export const AddUserToWorkspaceV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    members: z
      .object({
        orgMembershipId: z.string().trim(),
        workspaceEncryptedKey: z.string().trim(),
        workspaceEncryptedNonce: z.string().trim()
      })
      .array()
      .min(1)
  })
});
