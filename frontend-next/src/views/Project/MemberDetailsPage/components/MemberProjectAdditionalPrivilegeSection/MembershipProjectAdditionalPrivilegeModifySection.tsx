import { Controller, FormProvider, useForm } from "react-hook-form";
import {
  faCaretDown,
  faChevronLeft,
  faClock,
  faPlus,
  faSave
} from "@fortawesome/free-solid-svg-icons";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormControl,
  FormLabel,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tag,
  Tooltip
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import {
  useCreateProjectUserAdditionalPrivilege,
  useGetProjectUserPrivilegeDetails,
  useUpdateProjectUserAdditionalPrivilege
} from "@app/hooks/api";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "@app/hooks/api/projectUserAdditionalPrivilege/types";
import { GeneralPermissionPolicies } from "@app/views/Project/RolePage/components/RolePermissionsSection/components/GeneralPermissionPolicies";
import { PermissionEmptyState } from "@app/views/Project/RolePage/components/RolePermissionsSection/PermissionEmptyState";
import {
  formRolePermission2API,
  isConditionalSubjects,
  PROJECT_PERMISSION_OBJECT,
  projectRoleFormSchema,
  rolePermission2Form} from "@app/views/Project/RolePage/components/RolePermissionsSection/ProjectRoleModifySection.utils";
import { renderConditionalComponents } from "@app/views/Project/RolePage/components/RolePermissionsSection/RolePermissionsSection";

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
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const { data: privilegeDetails, isLoading } = useGetProjectUserPrivilegeDetails(
    privilegeId || ""
  );

  const { permission } = useProjectPermission();
  const isMemberEditDisabled = permission.cannot(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Member
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

  const { mutateAsync: updateUserProjectAdditionalPrivilege } =
    useUpdateProjectUserAdditionalPrivilege();
  const { mutateAsync: createUserProjectAdditionalPrivilege } =
    useCreateProjectUserAdditionalPrivilege();

  const onSubmit = async (el: TFormSchema) => {
    const accessType = !el.temporaryAccess.isTemporary
      ? { isTemporary: false as const }
      : {
          isTemporary: true as const,
          temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative,
          temporaryRange: el.temporaryAccess.temporaryRange,
          temporaryAccessStartTime: el.temporaryAccess.temporaryAccessStartTime
        };

    try {
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
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to update privilege" });
    }
  };

  const onNewPolicy = (selectedSubject: ProjectPermissionSub) => {
    const rootPolicyValue = form.getValues(`permissions.${selectedSubject}`);
    if (rootPolicyValue && isConditionalSubjects(selectedSubject)) {
      form.setValue(
        `permissions.${selectedSubject}`,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-error akhilmhdh: this is because of ts collision with both
        [...rootPolicyValue, ...[]],
        { shouldDirty: true, shouldTouch: true }
      );
    } else {
      form.setValue(
        `permissions.${selectedSubject}`,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-error akhilmhdh: this is because of ts collision with both
        [{}],
        {
          shouldDirty: true,
          shouldTouch: true
        }
      );
    }
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
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <FormProvider {...form}>
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <Button
            leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
            className="text-lg font-semibold text-mineshaft-100"
            variant="link"
            onClick={onGoBack}
          >
            Back
          </Button>
          <div className="flex items-center space-x-4">
            {isDirty && (
              <Button
                className="mr-4 text-mineshaft-300"
                variant="link"
                isDisabled={isSubmitting}
                isLoading={isSubmitting}
                onClick={onGoBack}
              >
                Discard
              </Button>
            )}
            <div className="flex items-center">
              <Button
                variant="outline_bg"
                type="submit"
                className={twMerge("h-10 rounded-r-none", isDirty && "bg-primary text-black")}
                isDisabled={isSubmitting || !isDirty || isDisabled}
                isLoading={isSubmitting}
                leftIcon={<FontAwesomeIcon icon={faSave} />}
              >
                Save
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <Button
                    isDisabled={isDisabled}
                    className="h-10 rounded-l-none"
                    variant="outline_bg"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  >
                    New policy
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="thin-scrollbar max-h-96" align="end">
                  {Object.keys(PROJECT_PERMISSION_OBJECT)
                    .sort((a, b) =>
                      PROJECT_PERMISSION_OBJECT[a as keyof typeof PROJECT_PERMISSION_OBJECT].title
                        .toLowerCase()
                        .localeCompare(
                          PROJECT_PERMISSION_OBJECT[
                            b as keyof typeof PROJECT_PERMISSION_OBJECT
                          ].title.toLowerCase()
                        )
                    )
                    .map((subject) => (
                      <DropdownMenuItem
                        key={`permission-create-${subject}`}
                        className="py-3"
                        onClick={() => onNewPolicy(subject as ProjectPermissionSub)}
                      >
                        {PROJECT_PERMISSION_OBJECT[subject as ProjectPermissionSub].title}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <div className="mt-2 border-b border-gray-800 p-4 pt-2 first:rounded-t-md last:rounded-b-md">
          <div className="text-lg">Overview</div>
          <p className="mb-4 text-sm text-mineshaft-300">
            Additional privileges take precedence over roles when permissions conflict
          </p>
          <div className=" flex items-end space-x-6">
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
                  <div className="w-full max-w-md flex-grow">
                    <FormLabel label="Duration" />
                    <Tooltip content={toolTipText}>
                      <Button
                        variant="outline_bg"
                        leftIcon={isTemporary ? <FontAwesomeIcon icon={faClock} /> : undefined}
                        rightIcon={<FontAwesomeIcon icon={faCaretDown} className="ml-2" />}
                        isDisabled={isMemberEditDisabled}
                        className={twMerge(
                          "w-full border-none bg-mineshaft-600 py-2.5 text-xs capitalize hover:bg-mineshaft-500",
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
                    <div className="border-b border-b-gray-700 pb-2 text-sm text-mineshaft-300">
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
        <div className="p-4">
          <div className="mb-2 text-lg">Policies</div>
          {(isCreate || !isLoading) && <PermissionEmptyState />}
          {(Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[]).map((subject) => (
            <GeneralPermissionPolicies
              subject={subject}
              actions={PROJECT_PERMISSION_OBJECT[subject].actions}
              title={PROJECT_PERMISSION_OBJECT[subject].title}
              key={`project-permission-${subject}`}
              isDisabled={isDisabled}
            >
              {renderConditionalComponents(subject, isDisabled)}
            </GeneralPermissionPolicies>
          ))}
        </div>
      </FormProvider>
    </form>
  );
};
