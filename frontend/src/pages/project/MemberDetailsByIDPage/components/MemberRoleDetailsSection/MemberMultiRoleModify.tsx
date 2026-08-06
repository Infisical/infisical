/* eslint-disable no-nested-ternary */
import { useMemo } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, formatDistance } from "date-fns";
import { ChevronDownIcon, ClockIcon, PlusIcon, TrashIcon } from "lucide-react";
import ms from "ms";
import picomatch from "picomatch";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Lottie } from "@app/components/v2";
import {
  Badge,
  Button,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
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
  ProjectPermissionActions,
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
  roles: z
    .object({
      slug: z.string(),
      temporaryAccess: z.discriminatedUnion("isTemporary", [
        z.object({
          isTemporary: z.literal(true),
          temporaryRange: z.string().min(1),
          temporaryAccessStartTime: z.string().datetime(),
          temporaryAccessEndTime: z.string().datetime().nullable().optional()
        }),
        z.object({
          isTemporary: z.literal(false)
        })
      ])
    })
    .array()
});
type TRoleForm = z.infer<typeof roleFormSchema>;

type Props = {
  projectMember: TWorkspaceUser;
  onOpenUpgradeModal: () => void;
  onSuccess?: () => void;
};

export const MemberMultiRoleModify = ({
  projectMember,
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
        getKey: (role) => role.slug,
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
      roles: projectMember?.roles?.map(({ customRoleSlug, role, ...dto }) => ({
        slug: customRoleSlug || role,
        temporaryAccess: dto.isTemporary
          ? {
              isTemporary: true,
              temporaryRange: dto.temporaryRange,
              temporaryAccessEndTime: dto.temporaryAccessEndTime,
              temporaryAccessStartTime: dto.temporaryAccessStartTime
            }
          : {
              isTemporary: dto.isTemporary
            }
      }))
    }
  });
  const selectedRoleList = useFieldArray({
    name: "roles",
    control: roleForm.control
  });

  const formRoleField = roleForm.watch("roles");
  const updateMembershipRole = useUpdateUserWorkspaceRole();

  const handleRoleUpdate = async (data: TRoleForm) => {
    if (updateMembershipRole.isPending) return;

    const sanitizedRoles = data.roles.map((el) => {
      const { isTemporary } = el.temporaryAccess;
      if (!isTemporary) {
        return { role: el.slug, isTemporary: false as const };
      }
      return {
        role: el.slug,
        isTemporary: true as const,
        temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
        temporaryRange: el.temporaryAccess.temporaryRange,
        temporaryAccessStartTime: el.temporaryAccess.temporaryAccessStartTime
      };
    });

    const hasCustomRoleSelected = sanitizedRoles.some(
      (el) => !Object.values(ProjectMembershipRole).includes(el.role as ProjectMembershipRole)
    );

    if (hasCustomRoleSelected && subscription && !subscription?.rbac) {
      onOpenUpgradeModal();
      return;
    }

    const isCertManager = currentProject?.type === ProjectType.CertificateManager;
    await updateMembershipRole.mutateAsync({
      projectId,
      projectType: currentProject?.type,
      membershipId: isCertManager ? projectMember.user.id : projectMember.id,
      roles: sanitizedRoles
    });
    createNotification({ text: "Successfully updated roles", type: "success" });
    onSuccess?.();
  };

  if (isRolesLoading) {
    return (
      <div className="flex h-40 w-full items-center justify-center">
        <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
      </div>
    );
  }

  return (
    <form onSubmit={roleForm.handleSubmit(handleRoleUpdate)}>
      <div className="flex flex-col gap-3">
        {selectedRoleList.fields.map(({ id }, index) => {
          const { temporaryAccess } = formRoleField[index];
          const isTemporary = temporaryAccess?.isTemporary;
          const isExpired =
            temporaryAccess.isTemporary &&
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
              text = formatDistance(
                new Date(temporaryAccess.temporaryAccessEndTime || ""),
                new Date()
              );
              toolTipText = `Until ${format(
                new Date(temporaryAccess.temporaryAccessEndTime || ""),
                "yyyy-MM-dd HH:mm:ss"
              )}`;
            }
          }

          return (
            <div key={id} className="flex items-end gap-2">
              <Controller
                control={roleForm.control}
                name={`roles.${index}.slug`}
                render={({ field }) => {
                  const rolesForSelect = getRolesForSelect(field.value);
                  return (
                    <Field className="min-w-0 flex-1">
                      {index === 0 && <FieldLabel>Role</FieldLabel>}
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
                {index === 0 && <FieldLabel>Duration</FieldLabel>}
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
                        name={`roles.${index}.temporaryAccess.temporaryRange`}
                        render={({ field, fieldState: { error } }) => {
                          const showInvalidError =
                            Boolean(field.value) && !isValidTemporaryRange(field.value);
                          const errorMessage = showInvalidError
                            ? TEMPORARY_RANGE_ERROR
                            : error?.message;
                          const canGrant = isValidTemporaryRange(field.value);

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
                                        `roles.${index}.temporaryAccess.temporaryRange`,
                                        { type: "required", message: "Required" },
                                        { shouldFocus: false }
                                      );
                                      return;
                                    }
                                    if (!isValidTemporaryRange(nextValue)) {
                                      roleForm.setError(
                                        `roles.${index}.temporaryAccess.temporaryRange`,
                                        {
                                          type: "validate",
                                          message: TEMPORARY_RANGE_ERROR
                                        },
                                        { shouldFocus: false }
                                      );
                                      return;
                                    }
                                    roleForm.clearErrors(
                                      `roles.${index}.temporaryAccess.temporaryRange`
                                    );
                                  }}
                                />
                                {errorMessage && <FieldError>{errorMessage}</FieldError>}
                              </Field>
                              <div className="flex items-center space-x-2">
                                <Button
                                  size="xs"
                                  variant="outline"
                                  isDisabled={!canGrant}
                                  onClick={() => {
                                    const temporaryRange = field.value;
                                    if (!isValidTemporaryRange(temporaryRange)) {
                                      roleForm.setError(
                                        `roles.${index}.temporaryAccess.temporaryRange`,
                                        {
                                          type: "validate",
                                          message: TEMPORARY_RANGE_ERROR
                                        },
                                        { shouldFocus: true }
                                      );
                                      return;
                                    }
                                    roleForm.clearErrors(
                                      `roles.${index}.temporaryAccess.temporaryRange`
                                    );
                                    roleForm.setValue(
                                      `roles.${index}.temporaryAccess`,
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
                                        `roles.${index}.temporaryAccess`,
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
              <IconButton
                size="md"
                variant="outline"
                aria-label="Remove role"
                className="shrink-0 hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                isDisabled={isEditDisabled || selectedRoleList.fields.length === 1}
                onClick={() => {
                  if (selectedRoleList.fields.length > 1) {
                    selectedRoleList.remove(index);
                  }
                }}
              >
                <TrashIcon />
              </IconButton>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Member}>
          {(isAllowed) => (
            <Button
              type="button"
              variant="outline"
              isDisabled={!isAllowed || isEditDisabled}
              onClick={() =>
                selectedRoleList.append({
                  slug: ProjectMembershipRole.Member,
                  temporaryAccess: { isTemporary: false }
                })
              }
            >
              <PlusIcon />
              Add Role
            </Button>
          )}
        </ProjectPermissionCan>
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
          Save Roles
        </Button>
      </div>
    </form>
  );
};
