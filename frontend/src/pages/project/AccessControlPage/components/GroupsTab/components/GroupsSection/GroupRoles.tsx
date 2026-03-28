import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, ClockIcon, EditIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { FormControl, Spinner } from "@app/components/v2";
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useGetProjectRoles, useUpdateGroupWorkspaceRole } from "@app/hooks/api";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { ProjectUserMembershipTemporaryMode } from "@app/hooks/api/projects/types";
import { TProjectRole } from "@app/hooks/api/roles/types";
import { groupBy } from "@app/lib/fn/array";
import {
  canModifyByGrantConditions,
  filterByGrantConditions,
  getGroupAssignRoleConditions
} from "@app/lib/fn/permission";

const temporaryRoleFormSchema = z.object({
  temporaryRange: z.string().min(1, "Required")
});

type TTemporaryRoleFormSchema = z.infer<typeof temporaryRoleFormSchema>;

type TTemporaryRoleFormProps = {
  temporaryConfig?: {
    isTemporary?: boolean;
    temporaryAccessEndTime?: string | null;
    temporaryAccessStartTime?: string | null;
    temporaryRange?: string | null;
  };
  onSetTemporary: (data: { temporaryRange: string; temporaryAccessStartTime?: string }) => void;
  onRemoveTemporary: () => void;
};

const IdentityTemporaryRoleForm = ({
  temporaryConfig: defaultValues = {},
  onSetTemporary,
  onRemoveTemporary
}: TTemporaryRoleFormProps) => {
  const { popUp, handlePopUpToggle } = usePopUp(["setTempRole"] as const);
  const { control, handleSubmit } = useForm<TTemporaryRoleFormSchema>({
    resolver: zodResolver(temporaryRoleFormSchema),
    values: {
      temporaryRange: defaultValues.temporaryRange || "1h"
    }
  });
  const isTemporaryFieldValue = defaultValues.isTemporary;
  const isExpired =
    isTemporaryFieldValue && new Date() > new Date(defaultValues.temporaryAccessEndTime || "");

  return (
    <Popover
      open={popUp.setTempRole.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("setTempRole", isOpen);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <UnstableIconButton
              // eslint-disable-next-line no-nested-ternary
              variant={isExpired ? "danger" : isTemporaryFieldValue ? "warning" : "ghost"}
              size="xs"
              onClick={(e) => e.stopPropagation()}
            >
              <ClockIcon />
            </UnstableIconButton>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{isExpired ? "Access Expired" : "Grant Temporary Access"}</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="right"
        sideOffset={12}
        className="w-72"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col space-y-4">
          <div className="border-b border-border pb-2 text-sm text-muted">Set Role Temporarily</div>
          {isExpired && <Badge variant="danger">Expired</Badge>}
          <Controller
            control={control}
            name="temporaryRange"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Validity"
                isError={Boolean(error?.message)}
                errorText={error?.message}
                helperText={
                  <span>
                    1m, 2h, 3d.{" "}
                    <a
                      href="https://github.com/vercel/ms?tab=readme-ov-file#examples"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      More
                    </a>
                  </span>
                }
              >
                <UnstableInput {...field} isError={Boolean(error?.message)} />
              </FormControl>
            )}
          />
          <div className="flex items-center gap-2">
            {isTemporaryFieldValue && (
              <Button
                size="xs"
                type="submit"
                onClick={() => {
                  handleSubmit(({ temporaryRange }) => {
                    onSetTemporary({
                      temporaryRange,
                      temporaryAccessStartTime: new Date().toISOString()
                    });
                    handlePopUpToggle("setTempRole");
                  })();
                }}
              >
                Restart
              </Button>
            )}
            {!isTemporaryFieldValue ? (
              <Button
                size="xs"
                type="submit"
                onClick={() =>
                  handleSubmit(({ temporaryRange }) => {
                    onSetTemporary({
                      temporaryRange,
                      temporaryAccessStartTime:
                        defaultValues.temporaryAccessStartTime || new Date().toISOString()
                    });
                    handlePopUpToggle("setTempRole");
                  })()
                }
              >
                Grant access
              </Button>
            ) : (
              <Button
                size="xs"
                variant="danger"
                onClick={() => {
                  onRemoveTemporary();
                  handlePopUpToggle("setTempRole");
                }}
              >
                Revoke Access
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const formSchema = z.record(
  z.object({
    isChecked: z.boolean().optional(),
    temporaryAccess: z.union([
      z.object({
        isTemporary: z.literal(true),
        temporaryRange: z.string().min(1),
        temporaryAccessStartTime: z.string().datetime(),
        temporaryAccessEndTime: z.string().datetime().nullable().optional()
      }),
      z.boolean()
    ])
  })
);
type TForm = z.infer<typeof formSchema>;

export type TMemberRolesProp = {
  disableEdit?: boolean;
  groupId: string;
  groupName: string;
  className?: string;
  roles: TGroupMembership["roles"];
};

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;

type FormProps = {
  projectRoles: Omit<TProjectRole, "permissions">[] | undefined;
  roles: TGroupMembership["roles"];
  groupId: string;
  onClose: VoidFunction;
};

const GroupRolesForm = ({ projectRoles, roles, groupId, onClose }: FormProps) => {
  const { currentProject } = useProject();

  const userRolesGroupBySlug = groupBy(roles, ({ customRoleSlug, role }) => customRoleSlug || role);

  const updateGroupWorkspaceRole = useUpdateGroupWorkspaceRole();

  const {
    handleSubmit,
    control,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema)
  });

  const handleRoleUpdate = async (data: TForm) => {
    const selectedRoles = Object.keys(data)
      .filter((el) => Boolean(data[el].isChecked))
      .map((el) => {
        const isTemporary = Boolean(data[el].temporaryAccess);
        if (!isTemporary) {
          return { role: el, isTemporary: false as const };
        }

        const tempCfg = data[el].temporaryAccess as {
          temporaryRange: string;
          temporaryAccessStartTime: string;
        };

        return {
          role: el,
          isTemporary: true as const,
          temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
          temporaryRange: tempCfg.temporaryRange,
          temporaryAccessStartTime: tempCfg.temporaryAccessStartTime
        };
      });

    await updateGroupWorkspaceRole.mutateAsync({
      projectId: currentProject?.id || "",
      groupId,
      roles: selectedRoles
    });
    createNotification({ text: "Successfully updated group role", type: "success" });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit(handleRoleUpdate)} id="role-update-form">
      <Command>
        <CommandInput placeholder="Search roles..." />
        <CommandList>
          <CommandEmpty>No roles found</CommandEmpty>
          <CommandGroup>
            {(projectRoles ?? []).map(({ id, name, slug }) => {
              const userProjectRoleDetails = userRolesGroupBySlug?.[slug]?.[0];

              return (
                <Controller
                  key={id}
                  control={control}
                  defaultValue={Boolean(userProjectRoleDetails?.id)}
                  name={`${slug}.isChecked`}
                  render={({ field }) => (
                    <CommandItem
                      value={slug}
                      keywords={[name]}
                      onSelect={() => {
                        field.onChange(!field.value);
                        setValue(`${slug}.temporaryAccess`, false);
                      }}
                    >
                      <CheckIcon
                        className={cn("size-4 shrink-0", field.value ? "opacity-100" : "opacity-0")}
                      />
                      <span className="truncate">{name}</span>
                      <div className="ml-auto">
                        <Controller
                          control={control}
                          name={`${slug}.temporaryAccess`}
                          defaultValue={
                            userProjectRoleDetails?.isTemporary
                              ? {
                                  isTemporary: true,
                                  temporaryAccessStartTime:
                                    userProjectRoleDetails.temporaryAccessStartTime as string,
                                  temporaryRange: userProjectRoleDetails.temporaryRange as string,
                                  temporaryAccessEndTime:
                                    userProjectRoleDetails.temporaryAccessEndTime
                                }
                              : false
                          }
                          render={({ field: tempField }) => (
                            <IdentityTemporaryRoleForm
                              temporaryConfig={
                                typeof tempField.value === "boolean"
                                  ? { isTemporary: tempField.value }
                                  : tempField.value
                              }
                              onSetTemporary={(data) => {
                                setValue(`${slug}.isChecked`, true, {
                                  shouldDirty: true
                                });
                                tempField.onChange({ isTemporary: true, ...data });
                              }}
                              onRemoveTemporary={() => {
                                setValue(`${slug}.isChecked`, false, {
                                  shouldDirty: true
                                });
                                tempField.onChange(false);
                              }}
                            />
                          )}
                        />
                      </div>
                    </CommandItem>
                  )}
                />
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
      <div className="flex items-center justify-end border-t border-border p-2">
        <Button
          size="xs"
          type="submit"
          isFullWidth
          variant="project"
          form="role-update-form"
          isDisabled={!isDirty || isSubmitting}
          isPending={isSubmitting}
        >
          <CheckIcon />
          Save
        </Button>
      </div>
    </form>
  );
};

export const GroupRoles = ({
  roles = [],
  disableEdit = false,
  groupId,
  groupName,
  className
}: TMemberRolesProp) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const { data: projectRoles, isPending: isRolesLoading } = useGetProjectRoles(
    currentProject?.id ?? ""
  );

  const assignRoleConditions = useMemo(
    () => getGroupAssignRoleConditions(permission),
    [permission]
  );

  const canModifyGroupRoles = useMemo(() => {
    if (!groupName) return false;

    const hasAnyGroupPrivilegeRule = permission.rules.some((rule) => {
      if (rule.inverted) return false;
      const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
      if (!ruleSubjects.includes(ProjectPermissionSub.Groups)) return false;
      const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
      return actions.some((a) => String(a) === "grant-privileges" || String(a) === "assign-role");
    });

    if (!hasAnyGroupPrivilegeRule) return false;
    if (!assignRoleConditions) return true;

    return canModifyByGrantConditions({
      targetValue: groupName,
      allowed: assignRoleConditions.groupNames,
      forbidden: assignRoleConditions.forbiddenGroupNames
    });
  }, [permission, assignRoleConditions, groupName]);

  const filteredProjectRoles = useMemo(
    () =>
      filterByGrantConditions(projectRoles ?? [], {
        getKey: (role) => role.slug,
        allowed: assignRoleConditions?.roles,
        forbidden: assignRoleConditions?.forbiddenRoles
      }),
    [projectRoles, assignRoleConditions]
  );

  const isEditDisabled = disableEdit || !canModifyGroupRoles;

  return (
    <div className={twMerge("flex items-center gap-1.5", className)}>
      {roles
        .slice(0, MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
        .map(({ role, customRoleName, id, isTemporary, temporaryAccessEndTime }) => {
          const isExpired = new Date() > new Date(temporaryAccessEndTime || ("" as string));
          return (
            <Badge key={id} variant={isExpired ? "danger" : "neutral"}>
              <span className="max-w-32 truncate capitalize">
                {formatProjectRoleName(role, customRoleName)}
              </span>
              {isTemporary && (
                <Tooltip>
                  <TooltipTrigger>
                    <ClockIcon />
                  </TooltipTrigger>
                  <TooltipContent>
                    {isExpired ? "Expired Temporary Access" : "Temporary Access"}
                  </TooltipContent>
                </Tooltip>
              )}
            </Badge>
          );
        })}
      {roles.length > MAX_ROLES_TO_BE_SHOWN_IN_TABLE && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="neutral" asChild>
              <button type="button" onClick={(e) => e.stopPropagation()}>
                +{roles.length - MAX_ROLES_TO_BE_SHOWN_IN_TABLE}
              </button>
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
            {roles
              .slice(MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
              .map(({ role, customRoleName, id, isTemporary, temporaryAccessEndTime }) => {
                const isExpired = new Date() > new Date(temporaryAccessEndTime || ("" as string));
                return (
                  <Badge key={id} className="z-10" variant={isExpired ? "danger" : "neutral"}>
                    <span className="capitalize">
                      {formatProjectRoleName(role, customRoleName)}
                    </span>
                    {isTemporary && (
                      <Tooltip>
                        <TooltipTrigger>
                          <ClockIcon />
                        </TooltipTrigger>
                        <TooltipContent>
                          {isExpired ? "Expired Temporary Access" : "Temporary Access"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </Badge>
                );
              })}
          </TooltipContent>
        </Tooltip>
      )}
      {!isEditDisabled && (
        <Popover open={isEditOpen} onOpenChange={setIsEditOpen}>
          <PopoverTrigger asChild>
            <UnstableIconButton variant="ghost" size="xs" onClick={(e) => e.stopPropagation()}>
              <EditIcon />
            </UnstableIconButton>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" onClick={(e) => e.stopPropagation()}>
            {isRolesLoading ? (
              <div className="flex h-8 w-full items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <GroupRolesForm
                projectRoles={filteredProjectRoles}
                groupId={groupId}
                roles={roles}
                onClose={() => setIsEditOpen(false)}
              />
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};
