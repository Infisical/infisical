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
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalContent,
  ModalTrigger,
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
import { usePopUp } from "@app/hooks";
import {
  useCreateIdentityProjectAdditionalPrivilege,
  useGetIdentityProjectPrivilegeDetails,
  useUpdateIdentityProjectAdditionalPrivilege
} from "@app/hooks/api";
import { IdentityProjectAdditionalPrivilegeTemporaryMode } from "@app/hooks/api/identityProjectAdditionalPrivilege/types";
import { GeneralPermissionPolicies } from "@app/views/Project/RolePage/components/RolePermissionsSection/components/GeneralPermissionPolicies";
import { NewPermissionRule } from "@app/views/Project/RolePage/components/RolePermissionsSection/components/NewPermissionRule";
import { PermissionEmptyState } from "@app/views/Project/RolePage/components/RolePermissionsSection/PermissionEmptyState";
import {
  formRolePermission2API,
  PROJECT_PERMISSION_OBJECT,
  projectRoleFormSchema,
  rolePermission2Form
} from "@app/views/Project/RolePage/components/RolePermissionsSection/ProjectRoleModifySection.utils";
import { renderConditionalComponents } from "@app/views/Project/RolePage/components/RolePermissionsSection/RolePermissionsSection";

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
  const { currentWorkspace } = useWorkspace();
  const { popUp, handlePopUpToggle } = usePopUp(["createPolicy"] as const);
  const projectId = currentWorkspace?.id || "";
  const { data: privilegeDetails, isLoading } = useGetIdentityProjectPrivilegeDetails({
    identityId,
    projectId,
    privilegeId
  });
  const { permission } = useProjectPermission();
  const isIdentityEditDisabled = permission.cannot(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Identity
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

    try {
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
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to update privilege" });
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
          <div className="flex space-x-2">
            <IconButton ariaLabel="go-back" variant="plain" onClick={onGoBack}>
              <FontAwesomeIcon icon={faChevronLeft} />
            </IconButton>
            <div>
              <h3 className="text-lg font-semibold text-mineshaft-100">
                Edit Additional Privileges
              </h3>
              <p className="text-sm text-mineshaft-400">
                Additional privileges take precedence over roles when permissions conflict
              </p>
            </div>
          </div>
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
              <Modal
                isOpen={popUp.createPolicy.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("createPolicy", isOpen)}
              >
                <ModalTrigger asChild>
                  <Button
                    className="h-10 rounded-l-none"
                    variant="outline_bg"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    isDisabled={isDisabled}
                  >
                    New Policy
                  </Button>
                </ModalTrigger>
                <ModalContent title="New Policy" subTitle="Policies grant additional permissions.">
                  <NewPermissionRule onClose={() => handlePopUpToggle("createPolicy")} />
                </ModalContent>
              </Modal>
            </div>
          </div>
        </div>
        <div className="mt-2 border-b border-gray-800 p-4 first:rounded-t-md last:rounded-b-md">
          <div className="mb-2 text-lg">Overview</div>
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
                <PopoverTrigger disabled={isIdentityEditDisabled} asChild>
                  <div className="w-full max-w-md flex-grow">
                    <FormLabel label="Access Type" />
                    <Tooltip content={toolTipText}>
                      <Button
                        variant="outline_bg"
                        leftIcon={isTemporary ? <FontAwesomeIcon icon={faClock} /> : undefined}
                        rightIcon={<FontAwesomeIcon icon={faCaretDown} className="ml-2" />}
                        isDisabled={isIdentityEditDisabled}
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
