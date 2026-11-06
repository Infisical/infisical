import { z } from "zod";

export const SignerIdParamsSchema = z.object({ signerId: z.string().guid() });

export const SignerRoleSchema = z.enum(["admin", "operator", "auditor"]);

export const RoleBodySchema = z.object({ role: SignerRoleSchema });

export const SignerMemberSchema = z.object({
  membershipId: z.string().guid(),
  signerId: z.string().guid(),
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

export const EffectiveSignerMemberSchema = z.object({
  actorUserId: z.string().guid().nullable(),
  actorIdentityId: z.string().guid().nullable(),
  role: z.string(),
  viaGroupIds: z.array(z.string().guid()),
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
  membershipId: z.string().guid(),
  signerId: z.string().guid()
});
