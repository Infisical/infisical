import { format, formatDistance } from "date-fns";
import ms from "ms";
import { z } from "zod";

import {
  ProjectUserMembershipTemporaryMode,
  TUpdateWorkspaceUserRoleDTO
} from "@app/hooks/api/projects/types";
import { TWorkspaceUser } from "@app/hooks/api/types";

export const TEMPORARY_RANGE_ERROR = "Only valid time values are accepted (1h, 20m, 2d).";

export const isValidTemporaryRange = (value?: string) => {
  if (!value?.trim()) return false;
  const parsedMs = ms(value);
  return typeof parsedMs === "number" && Number.isFinite(parsedMs) && parsedMs > 0;
};

// Shape of a single role assignment as edited in the form. The single-role editor uses this
// directly; the multi-role editor nests it under `roles[]`. Pair the `temporaryRange` refine
// with the Grant button's disabled state so an invalid duration can neither be granted nor saved.
export const roleAssignmentSchema = z.object({
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
export type TRoleAssignment = z.infer<typeof roleAssignmentSchema>;
export type TTemporaryAccess = TRoleAssignment["temporaryAccess"];

export type MemberRoleAssignment = TWorkspaceUser["roles"][number];
type TRolePayload = TUpdateWorkspaceUserRoleDTO["roles"][number];

// A membership stores custom roles under `customRoleSlug` with `role === "custom"`; every other
// role identifies itself by `role`.
export const getRoleSlug = (assignment: Pick<MemberRoleAssignment, "role" | "customRoleSlug">) =>
  assignment.role === "custom" ? (assignment.customRoleSlug ?? assignment.role) : assignment.role;

export const toFormAssignment = (assignment: MemberRoleAssignment): TRoleAssignment => ({
  slug: getRoleSlug(assignment),
  temporaryAccess: assignment.isTemporary
    ? {
        isTemporary: true,
        temporaryRange: assignment.temporaryRange,
        temporaryAccessEndTime: assignment.temporaryAccessEndTime,
        temporaryAccessStartTime: assignment.temporaryAccessStartTime
      }
    : { isTemporary: false }
});

export const formRoleToPayload = (assignment: TRoleAssignment): TRolePayload =>
  assignment.temporaryAccess.isTemporary
    ? {
        role: assignment.slug,
        isTemporary: true as const,
        temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
        temporaryRange: assignment.temporaryAccess.temporaryRange,
        temporaryAccessStartTime: assignment.temporaryAccess.temporaryAccessStartTime
      }
    : { role: assignment.slug, isTemporary: false as const };

// An untouched assignment is re-sent as-is (preserving its own temporary mode) so a targeted
// edit doesn't drop the member's other roles.
export const existingRoleToPayload = (assignment: MemberRoleAssignment): TRolePayload =>
  assignment.isTemporary
    ? {
        role: getRoleSlug(assignment),
        isTemporary: true as const,
        temporaryMode: assignment.temporaryMode,
        temporaryRange: assignment.temporaryRange,
        temporaryAccessStartTime: assignment.temporaryAccessStartTime
      }
    : { role: getRoleSlug(assignment), isTemporary: false as const };

type TDurationDisplay = {
  variant: "outline" | "warning" | "danger";
  text: string;
  tooltip: string;
  isExpired: boolean;
};

export const getDurationDisplay = (temporaryAccess?: TTemporaryAccess): TDurationDisplay => {
  if (!temporaryAccess?.isTemporary) {
    return {
      variant: "outline",
      text: "Permanent",
      tooltip: "Non-Expiring Access",
      isExpired: false
    };
  }

  const endTime = new Date(temporaryAccess.temporaryAccessEndTime || "");
  if (new Date() > endTime) {
    return {
      variant: "danger",
      text: "Access Expired",
      tooltip: "Timed Access Expired",
      isExpired: true
    };
  }

  return {
    variant: "warning",
    text: formatDistance(endTime, new Date()),
    tooltip: `Until ${format(endTime, "yyyy-MM-dd HH:mm:ss")}`,
    isExpired: false
  };
};
