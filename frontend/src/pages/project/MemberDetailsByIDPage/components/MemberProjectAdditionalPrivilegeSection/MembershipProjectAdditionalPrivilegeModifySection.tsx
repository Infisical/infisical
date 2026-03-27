import { useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, formatDistance } from "date-fns";
import { ChevronDownIcon, ClockIcon, SaveIcon } from "lucide-react";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Field,
  FieldError,
  FieldLabel,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SheetFooter,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableAccordion,
  UnstableInput,
  UnstableSeparator
} from "@app/components/v3";
import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  useCreateProjectUserAdditionalPrivilege,
  useGetProjectUserPrivilegeDetails,
  useUpdateProjectUserAdditionalPrivilege
} from "@app/hooks/api";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "@app/hooks/api/projectUserAdditionalPrivilege/types";
import {
  filterByGrantConditions,
  getMemberAssignPrivilegesConditions
} from "@app/lib/fn/permission";
import { AddPoliciesButton } from "@app/pages/project/RoleDetailsBySlugPage/components/AddPoliciesButton";
import { GeneralPermissionPolicies } from "@app/pages/project/RoleDetailsBySlugPage/components/GeneralPermissionPolicies";
import { PermissionEmptyState } from "@app/pages/project/RoleDetailsBySlugPage/components/PermissionEmptyState";
import {
  formRolePermission2API,
  PROJECT_PERMISSION_OBJECT,
  projectRoleFormSchema,
  rolePermission2Form
} from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";
import { renderConditionalComponents } from "@app/pages/project/RoleDetailsBySlugPage/components/RolePermissionsSection";

type Props = {
  privilegeId?: string;
  projectMembershipId: string;
  onGoBack: () => void;
  isDisabled?: boolean;
  menuPortalContainerRef?: React.RefObject<HTMLElement | null>;
  initialPermissions?: z.infer<typeof formSchema>["permissions"];
};

export const formSchema = z.object({
  slug: z.string().optional(),
  temporaryAccess: z
    .discriminatedUnion("isTemporary", [
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
    .default({ isTemporary: false }),
  permissions: projectRoleFormSchema.shape.permissions
});

type TFormSchema = z.infer<typeof formSchema>;

export const MembershipProjectAdditionalPrivilegeModifySection = ({
  privilegeId,
  onGoBack,
  projectMembershipId,
  isDisabled,
  menuPortalContainerRef,
  initialPermissions
}: Props) => {
  const isCreate = !privilegeId;
  const [openPolicies, setOpenPolicies] = useState<string[]>(() =>
    initialPermissions
      ? Object.keys(initialPermissions).filter(
          (k) => (initialPermissions as Record<string, unknown[]>)[k]?.length > 0
        )
      : []
  );
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";
  const { data: privilegeDetails, isPending } = useGetProjectUserPrivilegeDetails(
    privilegeId || ""
  );

  const { permission } = useProjectPermission();
  const isMemberEditDisabled = permission.cannot(
    ProjectPermissionMemberActions.Edit,
    ProjectPermissionSub.Member
  );

  const assignPrivilegesConditions = useMemo(
    () => getMemberAssignPrivilegesConditions(permission),
    [permission]
  );

  const filteredPermissionSubjects = useMemo(
    () =>
      filterByGrantConditions(Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[], {
        getKey: (s) => s,
        allowed: assignPrivilegesConditions?.subjects,
        forbidden: assignPrivilegesConditions?.forbiddenSubjects
      }),
    [assignPrivilegesConditions]
  );

  const getFilteredActionsForSubject = useMemo(
    () => (subject: ProjectPermissionSub) =>
      filterByGrantConditions(PROJECT_PERMISSION_OBJECT[subject].actions, {
        getKey: (action) => `${subject}:${action.value}`,
        allowed: assignPrivilegesConditions?.actions,
        forbidden: assignPrivilegesConditions?.forbiddenActions
      }),
    [assignPrivilegesConditions]
  );

  const form = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: "",
      temporaryAccess: { isTemporary: false },
      permissions: initialPermissions ?? {}
    }
  });

  const {
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting }
  } = form;

  useEffect(() => {
    if (privilegeDetails) {
      reset({
        ...privilegeDetails,
        permissions: rolePermission2Form(privilegeDetails.permissions),
        temporaryAccess: privilegeDetails.isTemporary
          ? {
              isTemporary: true,
              temporaryRange: privilegeDetails.temporaryRange || "",
              temporaryAccessEndTime: privilegeDetails.temporaryAccessEndTime || "",
              temporaryAccessStartTime: privilegeDetails.temporaryAccessStartTime || ""
            }
          : {
              isTemporary: privilegeDetails.isTemporary
            }
      });
    }
  }, [privilegeDetails, reset]);

  const { mutateAsync: updateUserProjectAdditionalPrivilege } =
    useUpdateProjectUserAdditionalPrivilege();
  const { mutateAsync: createUserProjectAdditionalPrivilege } =
    useCreateProjectUserAdditionalPrivilege();

  const permissions = useWatch({ control: form.control, name: "permissions" });

  const hasPermissions = useMemo(
    () => Object.entries(permissions || {}).some(([key, value]) => key && value?.length > 0),
    [permissions]
  );

  const onSubmit = async (el: TFormSchema) => {
    const accessType = !el.temporaryAccess.isTemporary
      ? { isTemporary: false as const }
      : {
          isTemporary: true as const,
          temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative,
          temporaryRange: el.temporaryAccess.temporaryRange,
          temporaryAccessStartTime: el.temporaryAccess.temporaryAccessStartTime
        };

    if (isCreate) {
      await createUserProjectAdditionalPrivilege({
        permissions: formRolePermission2API(el.permissions),
        projectMembershipId,
        slug: el.slug || undefined,
        type: accessType
      });
      createNotification({ type: "success", text: "Successfully created privilege" });
    } else {
      if (!projectId || !privilegeDetails?.id) return;
      await updateUserProjectAdditionalPrivilege({
        privilegeId: privilegeDetails.id,
        permissions: formRolePermission2API(el.permissions),
        projectMembershipId,
        slug: el.slug || undefined,
        type: accessType
      });
      createNotification({ type: "success", text: "Successfully updated privilege" });
    }
    onGoBack();
  };

  // Expand accordion items that have validation errors
  const handleFormSubmit = handleSubmit(onSubmit, (formErrors) => {
    if (formErrors.permissions) {
      const subjectsWithErrors = Object.keys(formErrors.permissions) as ProjectPermissionSub[];
      setOpenPolicies((prev) => {
        const newOpenPolicies = new Set(prev);
        subjectsWithErrors.forEach((subject) => newOpenPolicies.add(subject));
        return Array.from(newOpenPolicies);
      });
    }
  });

  const privilegeTemporaryAccess = form.watch("temporaryAccess");
  const isTemporary = privilegeTemporaryAccess?.isTemporary;
  const isExpired =
    privilegeTemporaryAccess?.isTemporary &&
    new Date() > new Date(privilegeTemporaryAccess.temporaryAccessEndTime || "");
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
        new Date(privilegeTemporaryAccess.temporaryAccessEndTime || ""),
        new Date()
      );
      toolTipText = `Until ${format(
        new Date(privilegeTemporaryAccess.temporaryAccessEndTime || ""),
        "yyyy-MM-dd hh:mm:ss aaa"
      )}`;
    }
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleFormSubmit}>
      <FormProvider {...form}>
        <div className="thin-scrollbar flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-y-4">
            <div>
              <div className="flex items-end space-x-6">
                <div className="w-full max-w-md">
                  <Controller
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <Field>
                        <FieldLabel>
                          Privilege Name <span className="text-muted">(optional)</span>
                        </FieldLabel>
                        <UnstableInput {...field} />
                      </Field>
                    )}
                  />
                </div>
                <div>
                  <Popover>
                    <PopoverTrigger disabled={isMemberEditDisabled} asChild>
                      <div className="w-full max-w-md grow">
                        <FieldLabel>Duration</FieldLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant={durationVariant}
                              disabled={isMemberEditDisabled}
                              className="w-full capitalize"
                            >
                              {isTemporary && <ClockIcon className="size-4" />}
                              {text}
                              <ChevronDownIcon className="ml-2 size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{toolTipText}</TooltipContent>
                        </Tooltip>
                      </div>
                    </PopoverTrigger>
                    <PopoverContent side="right" onWheel={(e) => e.stopPropagation()}>
                      <div className="flex flex-col space-y-4">
                        <div className="border-b border-b-border pb-2 text-sm text-muted">
                          Configure Timed Access
                        </div>
                        {isExpired && <Badge variant="danger">Expired</Badge>}
                        <Controller
                          control={form.control}
                          defaultValue="1h"
                          name="temporaryAccess.temporaryRange"
                          render={({ field, fieldState: { error } }) => (
                            <>
                              <Field>
                                <FieldLabel>
                                  <TtlFormLabel label="Validity" />
                                </FieldLabel>
                                <UnstableInput {...field} isError={Boolean(error?.message)} />
                                {error?.message && <FieldError>{error.message}</FieldError>}
                              </Field>
                              <div className="flex items-center space-x-2">
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() => {
                                    const temporaryRange = field.value;
                                    if (!temporaryRange) {
                                      form.setError(
                                        "temporaryAccess.temporaryRange",
                                        { type: "required", message: "Required" },
                                        { shouldFocus: true }
                                      );
                                      return;
                                    }
                                    form.clearErrors("temporaryAccess.temporaryRange");
                                    form.setValue(
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
                                  {isTemporary ? "Restart" : "Configure"}
                                </Button>
                                {isTemporary && (
                                  <Button
                                    size="xs"
                                    variant="danger"
                                    onClick={() => {
                                      form.setValue(
                                        "temporaryAccess",
                                        {
                                          isTemporary: false
                                        },
                                        { shouldDirty: true }
                                      );
                                    }}
                                  >
                                    Remove Duration
                                  </Button>
                                )}
                              </div>
                            </>
                          )}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
            <UnstableSeparator />
            <div>
              <div className="mb-3 flex w-full items-center justify-between">
                <div className="text-lg">Policies</div>
                <div className="flex items-center gap-2">
                  {isDirty && (
                    <Button
                      type="button"
                      className="mr-4 text-muted"
                      variant="ghost"
                      disabled={isSubmitting}
                      onClick={() => {
                        if (privilegeDetails) {
                          reset({
                            ...privilegeDetails,
                            permissions: rolePermission2Form(privilegeDetails.permissions),
                            temporaryAccess: privilegeDetails.isTemporary
                              ? {
                                  isTemporary: true,
                                  temporaryRange: privilegeDetails.temporaryRange || "",
                                  temporaryAccessEndTime:
                                    privilegeDetails.temporaryAccessEndTime || "",
                                  temporaryAccessStartTime:
                                    privilegeDetails.temporaryAccessStartTime || ""
                                }
                              : { isTemporary: false }
                          });
                        } else {
                          reset({
                            slug: "",
                            temporaryAccess: { isTemporary: false },
                            permissions: {}
                          });
                        }
                      }}
                    >
                      Discard
                    </Button>
                  )}
                  {currentProject && (
                    <AddPoliciesButton
                      isDisabled={isDisabled}
                      projectType={currentProject.type}
                      projectId={projectId}
                      allowedSubjects={filteredPermissionSubjects}
                      portalContainer={menuPortalContainerRef}
                    />
                  )}
                </div>
              </div>
              {(isCreate || !isPending) && !hasPermissions && <PermissionEmptyState />}
              {hasPermissions && (
                <div className="thin-scrollbar overflow-y-auto">
                  <UnstableAccordion
                    type="multiple"
                    value={openPolicies}
                    onValueChange={setOpenPolicies}
                    className="overflow-clip rounded-md border border-border bg-container"
                  >
                    {filteredPermissionSubjects.map((permissionSubject) => {
                      const filteredActions = getFilteredActionsForSubject(permissionSubject);
                      if (filteredActions.length === 0) return null;

                      return (
                        <GeneralPermissionPolicies
                          subject={permissionSubject}
                          actions={filteredActions}
                          title={PROJECT_PERMISSION_OBJECT[permissionSubject].title}
                          description={PROJECT_PERMISSION_OBJECT[permissionSubject].description}
                          key={`project-permission-${permissionSubject}`}
                          isDisabled={isDisabled}
                          isOpen={openPolicies.includes(permissionSubject)}
                          menuPortalContainerRef={menuPortalContainerRef}
                        >
                          {renderConditionalComponents(permissionSubject, isDisabled)}
                        </GeneralPermissionPolicies>
                      );
                    })}
                  </UnstableAccordion>
                </div>
              )}
            </div>
          </div>
        </div>
        <SheetFooter className="justify-end border-t">
          <Button variant="ghost" onClick={onGoBack}>
            Cancel
          </Button>
          <Button variant="project" type="submit" disabled={isSubmitting || !isDirty}>
            <SaveIcon />
            Save
          </Button>
        </SheetFooter>
      </FormProvider>
    </form>
  );
};
