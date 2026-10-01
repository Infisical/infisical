import { z } from "zod";

export const ApplicationMemberSchema = z.object({
  membershipId: z.string().guid(),
  applicationId: z.string().guid(),
  actorUserId: z.string().guid().nullable().optional(),
  actorIdentityId: z.string().guid().nullable().optional(),
  actorGroupId: z.string().guid().nullable().optional(),
  role: z.string(),
  customRoleId: z.string().guid().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  details: z
    .object({
      name: z.string().nullable(),
      email: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      authMethod: z.string().nullable().optional(),
      slug: z.string().nullable().optional()
    })
    .nullable()
    .optional()
});

export const RoleBodySchema = z.object({ role: z.string().min(1) });

export const RemoveResponseSchema = z.object({
  membershipId: z.string().guid(),
  applicationId: z.string().guid()
});
