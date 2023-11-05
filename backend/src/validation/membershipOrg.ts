import { z } from "zod";

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
