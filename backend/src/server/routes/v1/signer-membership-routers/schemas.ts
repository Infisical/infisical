import { z } from "zod";

export const SignerIdParamsSchema = z.object({ signerId: z.string().uuid() });

export const SignerRoleSchema = z.enum(["admin", "operator", "auditor"]);

export const RoleBodySchema = z.object({ role: SignerRoleSchema });

export const SignerMemberSchema = z.object({
  membershipId: z.string().uuid(),
  signerId: z.string().uuid(),
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

export const EffectiveSignerMemberSchema = z.object({
  actorUserId: z.string().uuid().nullable(),
  actorIdentityId: z.string().uuid().nullable(),
  role: z.string(),
  viaGroupIds: z.array(z.string().uuid()),
  isDirect: z.boolean(),
  details: z
    .object({
      name: z.string().nullable(),
      email: z.string().nullable().optional(),
      username: z.string().nullable().optional(),
      authMethod: z.string().nullable().optional()
    })
    .nullable()
});

export const RemoveSignerMemberResponseSchema = z.object({
  membershipId: z.string().uuid(),
  signerId: z.string().uuid()
});
