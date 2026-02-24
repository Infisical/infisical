import { useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, formatDistance } from "date-fns";
import { ChevronDownIcon, ClockIcon, SaveIcon } from "lucide-react";
import ms from "ms";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  FormControl,
  FormLabel,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip
} from "@app/components/v2";
import { Badge, Button, UnstableAccordion, UnstableSeparator } from "@app/components/v3";
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
  isDisabled
}: Props) => {
  const isCreate = !privilegeId;
  const [openPolicies, setOpenPolicies] = useState<string[]>([]);
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

  const form = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: "",
      temporaryAccess: { isTemporary: false },
      permissions: {}
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

  const permissions = form.watch("permissions");

  const hasPermissions = useMemo(
    () => Object.entries(permissions || {}).some(([key, value]) => key && value?.length > 0),
    [JSON.stringify(permissions)]
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

  const privilegeTemporaryAccess = form.watch("temporaryAccess");
  const isTemporary = privilegeTemporaryAccess?.isTemporary;
  const isExpired =
    privilegeTemporaryAccess?.isTemporary &&
    new Date() > new Date(privilegeTemporaryAccess.temporaryAccessEndTime || "");
  let text = "Permanent";
  let toolTipText = "Non-Expiring Access";

  if (isTemporary) {
    if (isExpired) {
      text = "Access Expired";
      toolTipText = "Timed Access Expired";
    } else {
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
    <form className="flex flex-col gap-y-4" onSubmit={handleSubmit(onSubmit)}>
      <FormProvider {...form}>
        <div>
          <div className="flex items-end space-x-6">
            <div className="w-full max-w-md">
              <Controller
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormControl label="Privilege Name" isOptional className="mb-0">
                    <Input {...field} />
                  </FormControl>
                )}
              />
            </div>
            <div>
              <Popover>
                <PopoverTrigger disabled={isMemberEditDisabled} asChild>
                  <div className="w-full max-w-md grow">
                    <FormLabel label="Duration" />
                    <Tooltip content={toolTipText}>
                      <Button
                        variant="outline"
                        disabled={isMemberEditDisabled}
                        className={twMerge(
                          "w-full border-none bg-mineshaft-600 py-2.5 text-xs capitalize hover:bg-mineshaft-500",
                          isTemporary && "text-primary",
                          isExpired && "text-red-600"
                        )}
                      >
                        {isTemporary && <ClockIcon className="size-4" />}
                        {text}
                        <ChevronDownIcon className="ml-2 size-4" />
                      </Button>
                    </Tooltip>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  arrowClassName="fill-gray-600"
                  side="right"
                  sideOffset={12}
                  hideCloseBtn
                  className="border border-gray-600 pt-4"
                >
                  <div className="flex flex-col space-y-4">
                    <div className="border-b border-b-gray-700 pb-2 text-sm text-mineshaft-300">
                      Configure Timed Access
                    </div>
                    {isExpired && <Badge variant="danger">Expired</Badge>}
                    <Controller
                      control={form.control}
                      defaultValue="1h"
                      name="temporaryAccess.temporaryRange"
                      render={({ field, fieldState: { error } }) => (
                        <FormControl
                          label={<TtlFormLabel label="Validity" />}
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                        >
                          <Input {...field} />
                        </FormControl>
                      )}
                    />
                    <div className="flex items-center space-x-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => {
                          const temporaryRange = form.getValues("temporaryAccess.temporaryRange");
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
                        {isTemporary ? "Restart" : "Grant"}
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
                          Revoke Access
                        </Button>
                      )}
                    </div>
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
                  onClick={() => reset()}
                >
                  Discard
                </Button>
              )}
              <AddPoliciesButton
                isDisabled={isDisabled}
                projectType={currentProject.type}
                projectId={projectId}
              />
            </div>
          </div>
          {(isCreate || !isPending) && <PermissionEmptyState />}
          {hasPermissions && (
            <div className="scrollbar-thin max-h-[50vh] overflow-y-auto">
              <UnstableAccordion
                type="multiple"
                value={openPolicies}
                onValueChange={setOpenPolicies}
                className="overflow-clip rounded-md border border-border bg-container"
              >
                {(Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[]).map(
                  (permissionSubject) => (
                    <GeneralPermissionPolicies
                      subject={permissionSubject}
                      actions={PROJECT_PERMISSION_OBJECT[permissionSubject].actions}
                      title={PROJECT_PERMISSION_OBJECT[permissionSubject].title}
                      description={PROJECT_PERMISSION_OBJECT[permissionSubject].description}
                      key={`project-permission-${permissionSubject}`}
                      isDisabled={isDisabled}
                      isOpen={openPolicies.includes(permissionSubject)}
                    >
                      {renderConditionalComponents(permissionSubject, isDisabled)}
                    </GeneralPermissionPolicies>
                  )
                )}
              </UnstableAccordion>
            </div>
          )}
        </div>
        <UnstableSeparator />
        <div className="flex w-full items-center justify-end gap-x-2">
          <Button variant="ghost" onClick={onGoBack}>
            Cancel
          </Button>
          <Button variant="project" type="submit" disabled={isSubmitting || !isDirty}>
            <SaveIcon />
            Save
          </Button>
        </div>
      </FormProvider>
    </form>
  );
};
