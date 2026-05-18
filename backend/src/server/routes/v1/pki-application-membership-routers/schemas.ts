import { z } from "zod";

export const ApplicationMemberSchema = z.object({
  membershipId: z.string().uuid(),
  applicationId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable().optional(),
  actorIdentityId: z.string().uuid().nullable().optional(),
  actorGroupId: z.string().uuid().nullable().optional(),
  role: z.string(),
  customRoleId: z.string().uuid().nullable().optional(),
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
  membershipId: z.string().uuid(),
  applicationId: z.string().uuid()
});
