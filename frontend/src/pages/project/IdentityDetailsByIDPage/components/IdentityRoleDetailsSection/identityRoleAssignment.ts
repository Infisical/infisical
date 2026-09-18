import { format, formatDistance } from "date-fns";
import ms from "ms";
import { z } from "zod";

import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import { TemporaryPermissionMode, TRoles } from "@app/hooks/api/shared";

export const TEMPORARY_RANGE_ERROR = "Only valid time values are accepted (1h, 20m, 2d).";

export const isValidTemporaryRange = (value?: string) => {
  if (!value?.trim()) return false;
  const parsedMs = ms(value);
  return typeof parsedMs === "number" && Number.isFinite(parsedMs) && parsedMs > 0;
};

export const identityRoleAssignmentSchema = z.object({
  slug: z.string().min(1),
  temporaryAccess: z.discriminatedUnion("isTemporary", [
    z.object({
      isTemporary: z.literal(true),
      temporaryRange: z
        .string()
        .min(1, "Required")
        .refine(isValidTemporaryRange, TEMPORARY_RANGE_ERROR),
      temporaryAccessStartTime: z.string().datetime(),
      temporaryAccessEndTime: z.string().datetime().nullable().optional()
    }),
    z.object({
      isTemporary: z.literal(false)
    })
  ])
});

export const identityRoleFormSchema = z.object({
  roles: identityRoleAssignmentSchema.array()
});

export type TIdentityRoleForm = z.infer<typeof identityRoleFormSchema>;
export type TIdentityRoleAssignment = TIdentityRoleForm["roles"][number];
export type TIdentityTemporaryAccess = TIdentityRoleAssignment["temporaryAccess"];
export type TIdentityRole = IdentityProjectMembershipV1["roles"][number];

export const getIdentityRoleSlug = (role: Pick<TIdentityRole, "role" | "customRoleSlug">) =>
  role.role === "custom" ? role.customRoleSlug || role.role : role.role;

export const toIdentityRoleFormAssignment = (role: TIdentityRole): TIdentityRoleAssignment => ({
  slug: getIdentityRoleSlug(role),
  temporaryAccess: role.isTemporary
    ? {
        isTemporary: true,
        temporaryRange: role.temporaryRange,
        temporaryAccessEndTime: role.temporaryAccessEndTime,
        temporaryAccessStartTime: role.temporaryAccessStartTime
      }
    : { isTemporary: false }
});

export const identityRoleFormAssignmentToPayload = (
  role: TIdentityRoleAssignment
): TRoles[number] =>
  role.temporaryAccess.isTemporary
    ? {
        role: role.slug,
        isTemporary: true,
        temporaryMode: TemporaryPermissionMode.Relative,
        temporaryRange: role.temporaryAccess.temporaryRange,
        temporaryAccessStartTime: role.temporaryAccess.temporaryAccessStartTime
      }
    : { role: role.slug, isTemporary: false };

export const existingIdentityRoleToPayload = (role: TIdentityRole): TRoles[number] =>
  role.isTemporary
    ? {
        role: getIdentityRoleSlug(role),
        isTemporary: true,
        temporaryMode: role.temporaryMode,
        temporaryRange: role.temporaryRange,
        temporaryAccessStartTime: role.temporaryAccessStartTime
      }
    : { role: getIdentityRoleSlug(role), isTemporary: false };

export const getIdentityRoleDurationDisplay = (temporaryAccess?: TIdentityTemporaryAccess) => {
  if (!temporaryAccess?.isTemporary) {
    return {
      variant: "outline" as const,
      text: "Permanent",
      tooltip: "Non-Expiring Access",
      isExpired: false
    };
  }

  const endTime = new Date(temporaryAccess.temporaryAccessEndTime || "");
  if (new Date() > endTime) {
    return {
      variant: "danger" as const,
      text: "Access Expired",
      tooltip: "Timed Access Expired",
      isExpired: true
    };
  }

  return {
    variant: "warning" as const,
    text: formatDistance(endTime, new Date()),
    tooltip: `Until ${format(endTime, "yyyy-MM-dd HH:mm:ss")}`,
    isExpired: false
  };
};
