import { Controller, FormProvider, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { faCaretDown, faClock, faSave } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, formatDistance } from "date-fns";
import ms from "ms";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tag,
  Tooltip
} from "@app/components/v2";
import { UnstableSeparator } from "@app/components/v3";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  useCreateIdentityProjectAdditionalPrivilege,
  useGetIdentityProjectPrivilegeDetails,
  useUpdateIdentityProjectAdditionalPrivilege
} from "@app/hooks/api";
import { IdentityProjectAdditionalPrivilegeTemporaryMode } from "@app/hooks/api/identityProjectAdditionalPrivilege/types";
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
  identityId: string;
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

export const IdentityProjectAdditionalPrivilegeModifySection = ({
  privilegeId = "",
  onGoBack,
  identityId,
  isDisabled
}: Props) => {
  const isCreate = !privilegeId;
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";
  const { data: privilegeDetails, isPending } = useGetIdentityProjectPrivilegeDetails({
    identityId,
    projectId,
    privilegeId
  });
  const { permission } = useProjectPermission();
  const isIdentityEditDisabled = permission.cannot(
    ProjectPermissionIdentityActions.Edit,
    subject(ProjectPermissionSub.Identity, { identityId })
  );

  const form = useForm<TFormSchema>({
    values: privilegeDetails
      ? {
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
        }
      : undefined,
    resolver: zodResolver(formSchema)
  });

  const {
    handleSubmit,
    formState: { isDirty, isSubmitting }
  } = form;

  const { mutateAsync: updateIdentityProjectAdditionalPrivilege } =
    useUpdateIdentityProjectAdditionalPrivilege();
  const { mutateAsync: createIdentityProjectAdditionalPrivilege } =
    useCreateIdentityProjectAdditionalPrivilege();

  const onSubmit = async (el: TFormSchema) => {
    const accessType = !el.temporaryAccess.isTemporary
      ? { isTemporary: false as const }
      : {
          isTemporary: true as const,
          temporaryMode: IdentityProjectAdditionalPrivilegeTemporaryMode.Relative,
          temporaryRange: el.temporaryAccess.temporaryRange,
          temporaryAccessStartTime: el.temporaryAccess.temporaryAccessStartTime
        };

    if (isCreate) {
      await createIdentityProjectAdditionalPrivilege({
        permissions: formRolePermission2API(el.permissions),
        identityId,
        projectId,
        slug: el.slug || undefined,
        type: accessType
      });
      createNotification({ type: "success", text: "Successfully created privilege" });
    } else {
      if (!projectId || !privilegeDetails?.id) return;
      await updateIdentityProjectAdditionalPrivilege({
        privilegeId: privilegeDetails.id,
        permissions: formRolePermission2API(el.permissions),
        projectId,
        identityId,
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
                <PopoverTrigger disabled={isIdentityEditDisabled} asChild>
                  <div className="w-full max-w-md grow">
                    <FormLabel label="Duration" />
                    <Tooltip content={toolTipText}>
                      <Button
                        variant="outline_bg"
                        leftIcon={isTemporary ? <FontAwesomeIcon icon={faClock} /> : undefined}
                        rightIcon={<FontAwesomeIcon icon={faCaretDown} className="ml-2" />}
                        isDisabled={isIdentityEditDisabled}
                        className={twMerge(
                          "bg-mineshaft-600 hover:bg-mineshaft-500 w-full border-none py-2.5 text-xs capitalize",
                          isTemporary && "text-primary",
                          isExpired && "text-red-600"
                        )}
                      >
                        {text}
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
                    <div className="text-mineshaft-300 border-b border-b-gray-700 pb-2 text-sm">
                      Configure Timed Access
                    </div>
                    {isExpired && <Tag colorSchema="red">Expired</Tag>}
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
                          variant="outline_bg"
                          colorSchema="danger"
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
            <div className="flex items-center space-x-4">
              {isDirty && (
                <Button
                  className="text-mineshaft-300 mr-4"
                  variant="link"
                  isDisabled={isSubmitting}
                  isLoading={isSubmitting}
                  onClick={onGoBack}
                >
                  Discard Changes
                </Button>
              )}
              <div className="flex items-center">
                <AddPoliciesButton
                  isDisabled={isDisabled}
                  projectType={currentProject.type}
                  projectId={projectId}
                />
              </div>
            </div>
          </div>
          {(isCreate || !isPending) && <PermissionEmptyState />}
          <div className="scrollbar-thin max-h-[50vh] overflow-y-auto">
            {(Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[]).map(
              (permissionSubject) => (
                <GeneralPermissionPolicies
                  subject={permissionSubject}
                  actions={PROJECT_PERMISSION_OBJECT[permissionSubject].actions}
                  title={PROJECT_PERMISSION_OBJECT[permissionSubject].title}
                  key={`project-permission-${permissionSubject}`}
                  isDisabled={isDisabled}
                >
                  {renderConditionalComponents(permissionSubject, isDisabled)}
                </GeneralPermissionPolicies>
              )
            )}
          </div>
        </div>
        <UnstableSeparator />
        <div className="flex w-full items-center justify-end gap-x-2">
          <Button colorSchema="secondary" variant="plain" onClick={onGoBack}>
            Cancel
          </Button>
          <Button
            type="submit"
            isDisabled={isSubmitting || !isDirty || isDisabled}
            isLoading={isSubmitting}
            leftIcon={<FontAwesomeIcon icon={faSave} />}
          >
            Save
          </Button>
        </div>
      </FormProvider>
    </form>
  );
};
