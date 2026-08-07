import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, formatDistance } from "date-fns";
import { ChevronDownIcon, ClockIcon } from "lucide-react";
import ms from "ms";
import picomatch from "picomatch";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  PageLoader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useGetProjectRoles, useUpdateUserWorkspaceRole } from "@app/hooks/api";
import { ProjectType, ProjectUserMembershipTemporaryMode } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { TWorkspaceUser } from "@app/hooks/api/types";
import {
  canModifyByGrantConditions,
  filterByGrantConditions,
  getMemberAssignRoleConditions
} from "@app/lib/fn/permission";

const TEMPORARY_RANGE_ERROR = "Only valid time values are accepted (1h, 20m, 2d).";

const isValidTemporaryRange = (value?: string) => {
  if (!value?.trim()) return false;
  const parsedMs = ms(value);
  return typeof parsedMs === "number" && Number.isFinite(parsedMs) && parsedMs > 0;
};

const roleFormSchema = z.object({
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
type TRoleForm = z.infer<typeof roleFormSchema>;

export type MemberRoleAssignment = TWorkspaceUser["roles"][number];

type Props = {
  projectMember: TWorkspaceUser;
  role: MemberRoleAssignment;
  onOpenUpgradeModal: () => void;
  onSuccess?: () => void;
};

export const MemberSingleRoleModify = ({
  projectMember,
  role,
  onOpenUpgradeModal,
  onSuccess
}: Props) => {
  const { subscription } = useSubscription();
  const { projectId, currentProject } = useProject();
  const { data: projectRoles, isPending: isRolesLoading } = useGetProjectRoles(
    projectId,
    currentProject?.type
  );
  const { permission } = useProjectPermission();
  const isMemberEditDisabled = permission.cannot(
    ProjectPermissionMemberActions.Edit,
    ProjectPermissionSub.Member
  );

  const assignRoleConditions = useMemo(
    () => getMemberAssignRoleConditions(permission),
    [permission]
  );

  const canModifyMemberRoles = useMemo(() => {
    const memberEmail = projectMember?.user?.email;
    if (!memberEmail) return false;

    return canModifyByGrantConditions({
      targetValue: memberEmail,
      allowed: assignRoleConditions?.emails,
      forbidden: assignRoleConditions?.forbiddenEmails,
      isMatch: (value, pattern) => picomatch.isMatch(value, pattern)
    });
  }, [assignRoleConditions, projectMember?.user?.email]);

  const filteredRoles = useMemo(
    () =>
      filterByGrantConditions(projectRoles ?? [], {
        getKey: (r) => r.slug,
        allowed: assignRoleConditions?.roles,
        forbidden: assignRoleConditions?.forbiddenRoles
      }),
    [projectRoles, assignRoleConditions]
  );

  const assignableRoleSlugs = useMemo(
    () => new Set(filteredRoles.map((r) => r.slug)),
    [filteredRoles]
  );

  const getRolesForSelect = (currentSlug: string) => {
    const assignable = filteredRoles;
    const currentInAssignable = assignableRoleSlugs.has(currentSlug);
    if (currentInAssignable) return assignable;

    const currentRole = projectRoles?.find((r) => r.slug === currentSlug) ?? {
      slug: currentSlug,
      name: formatProjectRoleName(currentSlug),
      id: currentSlug
    };
    return [currentRole, ...assignable];
  };

  const isEditDisabled = isMemberEditDisabled || !canModifyMemberRoles;

  const roleForm = useForm<TRoleForm>({
    resolver: zodResolver(roleFormSchema),
    values: {
      slug: role.customRoleSlug || role.role,
      temporaryAccess: role.isTemporary
        ? {
            isTemporary: true,
            temporaryRange: role.temporaryRange,
            temporaryAccessEndTime: role.temporaryAccessEndTime,
            temporaryAccessStartTime: role.temporaryAccessStartTime
          }
        : {
            isTemporary: false
          }
    }
  });

  const temporaryAccess = roleForm.watch("temporaryAccess");
  const updateMembershipRole = useUpdateUserWorkspaceRole();

  const isTemporary = temporaryAccess?.isTemporary;
  const isExpired =
    temporaryAccess?.isTemporary &&
    new Date() > new Date(temporaryAccess.temporaryAccessEndTime || "");

  let durationVariant: "outline" | "warning" | "danger" = "outline";
  let text = "Permanent";
  let toolTipText = "Non-Expiring Access";

  if (isTemporary) {
    if (isExpired) {
      durationVariant = "danger";
      text = "Access Expired";
      toolTipText = "Timed Access Expired";
    } else {
      durationVariant = "warning";
      text = formatDistance(new Date(temporaryAccess.temporaryAccessEndTime || ""), new Date());
      toolTipText = `Until ${format(
        new Date(temporaryAccess.temporaryAccessEndTime || ""),
        "yyyy-MM-dd HH:mm:ss"
      )}`;
    }
  }

  const handleRoleUpdate = async (data: TRoleForm) => {
    if (updateMembershipRole.isPending) return;

    const nextRolePayload = data.temporaryAccess.isTemporary
      ? {
          role: data.slug,
          isTemporary: true as const,
          temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
          temporaryRange: data.temporaryAccess.temporaryRange,
          temporaryAccessStartTime: data.temporaryAccess.temporaryAccessStartTime
        }
      : { role: data.slug, isTemporary: false as const };

    const hasCustomRoleSelected = !Object.values(ProjectMembershipRole).includes(
      nextRolePayload.role as ProjectMembershipRole
    );

    if (hasCustomRoleSelected && subscription && !subscription?.rbac) {
      onOpenUpgradeModal();
      return;
    }

    const sanitizedRoles = projectMember.roles.map((existing) => {
      if (existing.id !== role.id) {
        return existing.isTemporary
          ? {
              role: existing.role === "custom" ? existing.customRoleSlug : existing.role,
              isTemporary: true as const,
              temporaryMode: existing.temporaryMode,
              temporaryRange: existing.temporaryRange,
              temporaryAccessStartTime: existing.temporaryAccessStartTime
            }
          : {
              role: existing.role === "custom" ? existing.customRoleSlug : existing.role,
              isTemporary: false as const
            };
      }
      return nextRolePayload;
    });

    const isCertManager = currentProject?.type === ProjectType.CertificateManager;
    await updateMembershipRole.mutateAsync({
      projectId,
      projectType: currentProject?.type,
      membershipId: isCertManager ? projectMember.user.id : projectMember.id,
      roles: sanitizedRoles
    });
    createNotification({ text: "Successfully updated role", type: "success" });
    onSuccess?.();
  };

  if (isRolesLoading) {
    return (
      <div className="h-40">
        <PageLoader lottieClassName="w-16" />
      </div>
    );
  }

  return (
    <form onSubmit={roleForm.handleSubmit(handleRoleUpdate)}>
      <div className="mt-2 flex items-end gap-2">
        <Controller
          control={roleForm.control}
          name="slug"
          render={({ field }) => {
            const rolesForSelect = getRolesForSelect(field.value);
            return (
              <Field className="min-w-0 flex-1">
                <FieldLabel>Role</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isEditDisabled}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[70]">
                    {rolesForSelect.map(({ name, slug, id: projectRoleId }) => {
                      const isAssignable = assignableRoleSlugs.has(slug);
                      return (
                        <SelectItem
                          value={slug}
                          key={projectRoleId}
                          disabled={!isAssignable}
                          description={
                            isAssignable
                              ? undefined
                              : "You don't have permission to assign this role"
                          }
                        >
                          {name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </Field>
            );
          }}
        />
        <Field className="w-44 shrink-0">
          <FieldLabel>Duration</FieldLabel>
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant={durationVariant}
                    isDisabled={isEditDisabled}
                    className="w-full capitalize"
                  >
                    {isTemporary && <ClockIcon />}
                    {text}
                    <ChevronDownIcon />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>{toolTipText}</TooltipContent>
            </Tooltip>
            <PopoverContent
              side="right"
              className="z-[70]"
              onWheel={(e) => e.stopPropagation()}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="flex flex-col space-y-4">
                <div className="border-b border-b-border pb-2 text-sm text-muted">
                  Configure Timed Access
                </div>
                {isExpired && <Badge variant="danger">Expired</Badge>}
                <Controller
                  control={roleForm.control}
                  defaultValue="1h"
                  name="temporaryAccess.temporaryRange"
                  render={({ field, fieldState: { error } }) => {
                    const showInvalidError =
                      Boolean(field.value) && !isValidTemporaryRange(field.value);
                    const errorMessage = showInvalidError ? TEMPORARY_RANGE_ERROR : error?.message;

                    return (
                      <>
                        <Field>
                          <FieldLabel>
                            <TtlFormLabel label="Validity" />
                          </FieldLabel>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            isError={Boolean(errorMessage)}
                            onChange={(e) => {
                              field.onChange(e);
                              const nextValue = e.target.value;
                              if (!nextValue) {
                                roleForm.setError(
                                  "temporaryAccess.temporaryRange",
                                  { type: "required", message: "Required" },
                                  { shouldFocus: false }
                                );
                                return;
                              }
                              if (!isValidTemporaryRange(nextValue)) {
                                roleForm.setError(
                                  "temporaryAccess.temporaryRange",
                                  {
                                    type: "validate",
                                    message: TEMPORARY_RANGE_ERROR
                                  },
                                  { shouldFocus: false }
                                );
                                return;
                              }
                              roleForm.clearErrors("temporaryAccess.temporaryRange");
                            }}
                          />
                          {errorMessage && <FieldError>{errorMessage}</FieldError>}
                        </Field>
                        <div className="flex items-center space-x-2">
                          <Button
                            size="xs"
                            variant="outline"
                            isDisabled={!isValidTemporaryRange(field.value)}
                            onClick={() => {
                              const temporaryRange = field.value;
                              if (!isValidTemporaryRange(temporaryRange)) {
                                roleForm.setError(
                                  "temporaryAccess.temporaryRange",
                                  {
                                    type: "validate",
                                    message: TEMPORARY_RANGE_ERROR
                                  },
                                  { shouldFocus: true }
                                );
                                return;
                              }
                              roleForm.clearErrors("temporaryAccess.temporaryRange");
                              roleForm.setValue(
                                "temporaryAccess",
                                {
                                  isTemporary: true,
                                  temporaryAccessStartTime: new Date().toISOString(),
                                  temporaryRange,
                                  temporaryAccessEndTime: new Date(
                                    new Date().getTime() + ms(temporaryRange)
                                  ).toISOString()
                                },
                                { shouldDirty: true }
                              );
                            }}
                          >
                            {isTemporary ? "Restart" : "Grant"}
                          </Button>
                          {isTemporary && (
                            <Button
                              size="xs"
                              variant="danger"
                              onClick={() => {
                                roleForm.setValue(
                                  "temporaryAccess",
                                  { isTemporary: false },
                                  { shouldDirty: true }
                                );
                              }}
                            >
                              Revoke Access
                            </Button>
                          )}
                        </div>
                      </>
                    );
                  }}
                />
              </div>
            </PopoverContent>
          </Popover>
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          type="submit"
          variant="project"
          className={twMerge(
            "transition-all",
            "cursor-default opacity-0",
            roleForm.formState.isDirty && "cursor-pointer opacity-100"
          )}
          isDisabled={!roleForm.formState.isDirty || isEditDisabled}
          isPending={roleForm.formState.isSubmitting}
        >
          Save Role
        </Button>
      </div>
    </form>
  );
};
