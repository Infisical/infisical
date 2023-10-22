import { Types } from "mongoose";
import { z } from "zod";
import { IUser, Organization } from "../models";
import { OrganizationNotFoundError, UnauthorizedRequestError } from "../utils/errors";
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
  acceptedStatuses
}: {
  authData: AuthData;
  organizationId: Types.ObjectId;
  acceptedRoles: Array<"owner" | "admin" | "member">;
  acceptedStatuses: Array<"invited" | "accepted">;
}) => {
  const organization = await Organization.findById(organizationId);

  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  let membershipOrg;
  switch (authData.actor.type) {
    case ActorType.USER:
      membershipOrg = await validateUserClientForOrganization({
        user: authData.authPayload as IUser,
        organization,
        acceptedRoles,
        acceptedStatuses
      });

      return { organization, membershipOrg };
    case ActorType.SERVICE:
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for organization"
      });
    case ActorType.SERVICE_V3:
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for organization"
      });
  }
};

export const GetOrgPlansTablev1 = z.object({
  query: z.object({ billingCycle: z.enum(["monthly", "yearly"]) }),
  params: z.object({ organizationId: z.string().trim() })
});

export const GetOrgPlanv1 = z.object({
  params: z.object({ organizationId: z.string().trim() }),
  query: z.object({ workspaceId: z.string().trim().optional() })
});

export const StartOrgTrailv1 = z.object({
  params: z.object({ organizationId: z.string().trim() }),
  body: z.object({ success_url: z.string().trim() })
});

export const GetOrgPlanBillingInfov1 = z.object({
  params: z.object({ organizationId: z.string().trim() }),
  query: z.object({ workspaceId: z.string().trim().optional() })
});

export const GetOrgPlanTablev1 = z.object({
  params: z.object({ organizationId: z.string().trim() }),
  query: z.object({ workspaceId: z.string().trim().optional() })
});

export const GetOrgBillingDetailsv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const UpdateOrgBillingDetailsv1 = z.object({
  params: z.object({ organizationId: z.string().trim() }),
  body: z.object({
    email: z.string().trim().email().optional(),
    name: z.string().trim().optional()
  })
});

export const GetOrgPmtMethodsv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const CreateOrgPmtMethodv1 = z.object({
  params: z.object({ organizationId: z.string().trim() }),
  body: z.object({
    success_url: z.string().trim(),
    cancel_url: z.string().trim()
  })
});

export const DelOrgPmtMethodv1 = z.object({
  params: z.object({
    organizationId: z.string().trim(),
    pmtMethodId: z.string().trim()
  })
});

export const GetOrgTaxIdsv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const CreateOrgTaxId = z.object({
  params: z.object({ organizationId: z.string().trim() }),
  body: z.object({
    type: z.string().trim(),
    value: z.string().trim()
  })
});

export const DelOrgTaxIdv1 = z.object({
  params: z.object({
    organizationId: z.string().trim(),
    taxId: z.string().trim()
  })
});

export const GetOrgInvoicesv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const GetOrgLicencesv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const GetOrgv1 = z.object({
  params: z.object({
    organizationId: z.string().trim()
  })
});

export const GetOrgMembersv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const GetOrgWorkspacesv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const ChangeOrgNamev1 = z.object({
  params: z.object({ organizationId: z.string().trim() }),
  body: z.object({ name: z.string().trim() })
});

export const GetOrgIncidentContactv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const CreateOrgIncideContact = z.object({
  params: z.object({ organizationId: z.string().trim() }),
  body: z.object({ email: z.string().email().trim() })
});

export const DelOrgIncideContact = z.object({
  params: z.object({ organizationId: z.string().trim() }),
  body: z.object({ email: z.string().email().trim() })
});

export const CreateOrgPortalSessionv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const GetOrgMembersAndWsv1 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const GetOrgMembersv2 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const UpdateOrgMemberv2 = z.object({
  params: z.object({ organizationId: z.string().trim(), membershipId: z.string().trim() }),
  body: z.object({
    role: z.string().trim()
  })
});

export const DeleteOrgMemberv2 = z.object({
  params: z.object({ organizationId: z.string().trim(), membershipId: z.string().trim() })
});

export const GetOrgWorkspacesv2 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});

export const VerfiyUserToOrganizationV1 = z.object({
  body: z.object({
    email: z.string().trim().email(),
    organizationId: z.string().trim(),
    code: z.string().trim()
  })
});

export const CreateOrgv2 = z.object({
  body: z.object({
    name: z.string().trim()
  })
});

export const DeleteOrgv2 = z.object({
  params: z.object({ organizationId: z.string().trim() })
});