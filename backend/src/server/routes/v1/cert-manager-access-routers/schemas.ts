import { z } from "zod";

import { TemporaryPermissionMode } from "@app/db/schemas";
import { ms } from "@app/lib/ms";

export const MembershipRoleSchema = z.object({
  id: z.string(),
  role: z.string(),
  customRoleId: z.string().optional().nullable(),
  customRoleName: z.string().optional().nullable(),
  customRoleSlug: z.string().optional().nullable(),
  isTemporary: z.boolean(),
  temporaryMode: z.string().optional().nullable(),
  temporaryRange: z.string().nullable().optional(),
  temporaryAccessStartTime: z.date().nullable().optional(),
  temporaryAccessEndTime: z.date().nullable().optional()
});

export const RolesUpdateBodySchema = z.object({
  roles: z
    .array(
      z.union([
        z.object({
          role: z.string(),
          isTemporary: z.literal(false).default(false)
        }),
        z.object({
          role: z.string(),
          isTemporary: z.literal(true),
          temporaryMode: z.nativeEnum(TemporaryPermissionMode),
          temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
          temporaryAccessStartTime: z.string().datetime()
        })
      ])
    )
    .min(1)
    .refine((data) => data.some(({ isTemporary }) => !isTemporary), "At least one long lived role is required")
});
