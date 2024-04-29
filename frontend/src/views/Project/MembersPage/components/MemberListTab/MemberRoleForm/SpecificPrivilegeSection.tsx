import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  faArrowRotateLeft,
  faCaretDown,
  faCheck,
  faClock,
  faLockOpen,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, formatDistance } from "date-fns";
import ms from "ms";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Checkbox,
  DeleteActionModal,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  Spinner,
  Tag,
  Tooltip
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  TProjectUserPrivilege,
  useCreateAccessRequest,
  useCreateProjectUserAdditionalPrivilege,
  useDeleteProjectUserAdditionalPrivilege,
  useListProjectUserPrivileges,
  useUpdateProjectUserAdditionalPrivilege
} from "@app/hooks/api";
import { TAccessApprovalPolicy } from "@app/hooks/api/types";

const secretPermissionSchema = z.object({
  secretPath: z.string().optional(),
  environmentSlug: z.string(),
  [ProjectPermissionActions.Edit]: z.boolean().optional(),
  [ProjectPermissionActions.Read]: z.boolean().optional(),
  [ProjectPermissionActions.Create]: z.boolean().optional(),
  [ProjectPermissionActions.Delete]: z.boolean().optional(),
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
});
type TSecretPermissionForm = z.infer<typeof secretPermissionSchema>;
export const SpecificPrivilegeSecretForm = ({
  privilege,
  policies,
  onClose
}: {
  privilege?: TProjectUserPrivilege;
  policies?: TAccessApprovalPolicy[];
  onClose?: () => void;
}) => {
  const { currentWorkspace } = useWorkspace();

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deletePrivilege",
    "requestAccess"
  ] as const);
  const { permission } = useProjectPermission();
  const isMemberEditDisabled =
    permission.cannot(ProjectPermissionActions.Edit, ProjectPermissionSub.Member) && !!privilege;

  const updateUserPrivilege = useUpdateProjectUserAdditionalPrivilege();
  const deleteUserPrivilege = useDeleteProjectUserAdditionalPrivilege();
  const requestAccess = useCreateAccessRequest();

  const privilegeForm = useForm<TSecretPermissionForm>({
    resolver: zodResolver(secretPermissionSchema),
    values: {
      ...(privilege
        ? {
            environmentSlug: privilege.permissions?.[0]?.conditions?.environment,
            // secret path will be inside $glob operator
            secretPath: privilege.permissions?.[0]?.conditions?.secretPath?.$glob || "",
            read: privilege.permissions?.some(({ action }) =>
              action.includes(ProjectPermissionActions.Read)
            ),
            edit: privilege.permissions?.some(({ action }) =>
              action.includes(ProjectPermissionActions.Edit)
            ),
            create: privilege.permissions?.some(({ action }) =>
              action.includes(ProjectPermissionActions.Create)
            ),
            delete: privilege.permissions?.some(({ action }) =>
              action.includes(ProjectPermissionActions.Delete)
            ),
            // zod will pick it
            temporaryAccess: privilege
          }
        : {
            environmentSlug: currentWorkspace?.environments?.[0].slug!,
            read: false,
            edit: false,
            create: false,
            delete: false,
            temporaryAccess: {
              isTemporary: false
            }
          })
    }
  });

  const temporaryAccessField = privilegeForm.watch("temporaryAccess");
  const selectedEnvironment = privilegeForm.watch("environmentSlug");
  const secretPath = privilegeForm.watch("secretPath");

  const readAccess = privilegeForm.watch("read");
  const createAccess = privilegeForm.watch("create");
  const editAccess = privilegeForm.watch("edit");
  const deleteAccess = privilegeForm.watch("delete");

  const accessSelected = readAccess || createAccess || editAccess || deleteAccess;

  const selectablePaths = useMemo(() => {
    if (!policies) return [];
    const environmentPolicies = policies.filter(
      (policy) => policy.environment.slug === selectedEnvironment
    );

    privilegeForm.setValue("secretPath", "", {
      shouldValidate: true
    });

    return [...environmentPolicies.map((policy) => policy.secretPath)];
  }, [policies, selectedEnvironment]);

  const isTemporary = temporaryAccessField?.isTemporary;
  const isExpired =
    temporaryAccessField.isTemporary &&
    new Date() > new Date(temporaryAccessField.temporaryAccessEndTime || "");

  const handleUpdatePrivilege = async (data: TSecretPermissionForm) => {
    if (!privilege) {
      createNotification({
        type: "error",
        text: "No privilege to update found.",
        title: "Error"
      });

      return;
    }

    if (updateUserPrivilege.isLoading) return;
    try {
      const actions = [
        { action: ProjectPermissionActions.Read, allowed: data.read },
        { action: ProjectPermissionActions.Create, allowed: data.create },
        { action: ProjectPermissionActions.Delete, allowed: data.delete },
        { action: ProjectPermissionActions.Edit, allowed: data.edit }
      ];
      const conditions: Record<string, any> = { environment: data.environmentSlug };
      if (data.secretPath) {
        conditions.secretPath = { $glob: data.secretPath };
      }
      await updateUserPrivilege.mutateAsync({
        privilegeId: privilege.id,
        ...data.temporaryAccess,
        permissions: actions
          .filter(({ allowed }) => allowed)
          .map(({ action }) => ({
            action,
            subject: [ProjectPermissionSub.Secrets],
            conditions
          })),
        projectMembershipId: privilege.projectMembershipId
      });
      createNotification({
        type: "success",
        text: "Successfully updated  privilege"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to update privilege"
      });
    }
  };

  const handleDeletePrivilege = async () => {
    if (!privilege) {
      createNotification({
        type: "error",
        text: "No privilege to delete found.",
        title: "Error"
      });
      return;
    }

    if (deleteUserPrivilege.isLoading) return;
    try {
      await deleteUserPrivilege.mutateAsync({
        privilegeId: privilege.id,
        projectMembershipId: privilege.projectMembershipId
      });
      createNotification({
        type: "success",
        text: "Successfully deleted privilege"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to delete privilege"
      });
    }
  };

  // This is used for requesting access additional privileges, not directly creating a privilege!
  const handleRequestAccess = async (data: TSecretPermissionForm) => {
    if (!policies) return;
    if (!currentWorkspace) {
      createNotification({
        type: "error",
        text: "No workspace found.",
        title: "Error"
      });
      return;
    }

    if (!data.secretPath) {
      createNotification({
        type: "error",
        text: "Please select a secret path",
        title: "Error"
      });
      return;
    }

    const actions = [
      { action: ProjectPermissionActions.Read, allowed: data.read },
      { action: ProjectPermissionActions.Create, allowed: data.create },
      { action: ProjectPermissionActions.Delete, allowed: data.delete },
      { action: ProjectPermissionActions.Edit, allowed: data.edit }
    ];
    const conditions: Record<string, any> = { environment: data.environmentSlug };
    if (data.secretPath) {
      conditions.secretPath = { $glob: data.secretPath };
    }
    await requestAccess.mutateAsync({
      ...data,
      ...(data.temporaryAccess.isTemporary && {
        temporaryRange: data.temporaryAccess.temporaryRange
      }),
      projectSlug: currentWorkspace.slug,
      isTemporary: data.temporaryAccess.isTemporary,
      permissions: actions
        .filter(({ allowed }) => allowed)
        .map(({ action }) => ({
          action,
          subject: [ProjectPermissionSub.Secrets],
          conditions
        }))
    });

    createNotification({
      type: "success",
      text: "Successfully requested access"
    });
    privilegeForm.reset();
    if (onClose) onClose();
  };

  const handleSubmit = async (data: TSecretPermissionForm) => {
    if (privilege) {
      handleUpdatePrivilege(data);
    } else {
      handleRequestAccess(data);
    }
  };

  const getAccessLabel = (exactTime = false) => {
    if (isExpired) return "Access expired";
    if (!temporaryAccessField?.isTemporary) return "Permanent";

    if (exactTime && !policies) {
      return `Until ${format(
        new Date(temporaryAccessField.temporaryAccessEndTime || ""),
        "yyyy-MM-dd HH:mm:ss"
      )}`;
    }
    return formatDistance(new Date(temporaryAccessField.temporaryAccessEndTime || ""), new Date());
  };

  return (
    <div className="mt-4 w-full">
      <form onSubmit={privilegeForm.handleSubmit(handleSubmit)}>
        <div className={twMerge("flex items-start gap-4", !privilege && "flex-wrap")}>
          <Controller
            control={privilegeForm.control}
            name="environmentSlug"
            render={({ field: { onChange, ...field } }) => (
              <FormControl label="Environment">
                <Select
                  {...field}
                  isDisabled={isMemberEditDisabled}
                  className="bg-mineshaft-600 hover:bg-mineshaft-500"
                  onValueChange={(e) => onChange(e)}
                >
                  {currentWorkspace?.environments?.map(({ slug, id, name }) => (
                    <SelectItem value={slug} key={id}>
                      {name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={privilegeForm.control}
            name="secretPath"
            render={({ field }) => {
              if (policies) {
                return (
                  <Tooltip
                    isDisabled={!!selectablePaths.length}
                    content="The selected environment doesn't have any policies."
                  >
                    <div>
                      <FormControl label="Secret Path">
                        <Select
                          {...field}
                          isDisabled={isMemberEditDisabled || !selectablePaths.length}
                          className="w-48"
                          onValueChange={(e) => field.onChange(e)}
                        >
                          {selectablePaths.map((path) => (
                            <SelectItem value={path} key={path}>
                              {path}
                            </SelectItem>
                          ))}
                        </Select>
                      </FormControl>
                    </div>
                  </Tooltip>
                );
              }
              return (
                <FormControl label="Secret Path">
                  <SecretPathInput
                    {...field}
                    isDisabled={isMemberEditDisabled}
                    containerClassName="w-48"
                    environment={selectedEnvironment}
                  />
                </FormControl>
              );
            }}
          />
          <div className="flex flex-grow justify-between">
            <Controller
              control={privilegeForm.control}
              name="read"
              render={({ field }) => (
                <div className="flex flex-col items-center">
                  <FormLabel label="View" className="mb-4" />
                  <Checkbox
                    isDisabled={isMemberEditDisabled}
                    id="secret-read"
                    className="h-5 w-5"
                    isChecked={field.value}
                    onCheckedChange={(isChecked) => field.onChange(isChecked)}
                  />
                </div>
              )}
            />
            <Controller
              control={privilegeForm.control}
              name="create"
              render={({ field }) => (
                <div className="flex flex-col items-center">
                  <FormLabel label="Create" className="mb-4" />
                  <Checkbox
                    isDisabled={isMemberEditDisabled}
                    id="secret-create"
                    className="h-5 w-5"
                    isChecked={field.value}
                    onCheckedChange={(isChecked) => field.onChange(isChecked)}
                  />
                </div>
              )}
            />
            <Controller
              control={privilegeForm.control}
              name="edit"
              render={({ field }) => (
                <div className="flex flex-col items-center">
                  <FormLabel label="Modify" className="mb-4" />
                  <Checkbox
                    isDisabled={isMemberEditDisabled}
                    id="secret-modify"
                    className="h-5 w-5"
                    isChecked={field.value}
                    onCheckedChange={(isChecked) => field.onChange(isChecked)}
                  />
                </div>
              )}
            />
            <Controller
              control={privilegeForm.control}
              name="delete"
              render={({ field }) => (
                <div className="flex flex-col items-center">
                  <FormLabel label="Delete" className="mb-4" />
                  <Checkbox
                    isDisabled={isMemberEditDisabled}
                    id="secret-delete"
                    className="h-5 w-5"
                    isChecked={field.value}
                    onCheckedChange={(isChecked) => field.onChange(isChecked)}
                  />
                </div>
              )}
            />
          </div>
          <div className="mt-6 flex items-center space-x-2">
            <Popover>
              <PopoverTrigger disabled={isMemberEditDisabled}>
                <div>
                  <Tooltip content={getAccessLabel(true)}>
                    <Button
                      variant="outline_bg"
                      leftIcon={isTemporary ? <FontAwesomeIcon icon={faClock} /> : undefined}
                      rightIcon={<FontAwesomeIcon icon={faCaretDown} className="ml-2" />}
                      isDisabled={isMemberEditDisabled}
                      className={twMerge(
                        "border-none bg-mineshaft-600 py-2.5 text-xs capitalize hover:bg-mineshaft-500",
                        isTemporary && "text-primary",
                        isExpired && "text-red-600"
                      )}
                    >
                      {getAccessLabel(false)}
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
                    Configure timed access
                  </div>
                  {isExpired && <Tag colorSchema="red">Expired</Tag>}
                  <Controller
                    control={privilegeForm.control}
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
                        const temporaryRange = privilegeForm.getValues(
                          "temporaryAccess.temporaryRange"
                        );
                        if (!temporaryRange) {
                          privilegeForm.setError(
                            "temporaryAccess.temporaryRange",
                            { type: "required", message: "Required" },
                            { shouldFocus: true }
                          );
                          return;
                        }
                        privilegeForm.clearErrors("temporaryAccess.temporaryRange");
                        privilegeForm.setValue(
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
                      {temporaryAccessField.isTemporary && !policies ? "Restart" : "Grant"}
                    </Button>

                    {temporaryAccessField.isTemporary && (
                      <Button
                        size="xs"
                        variant="outline_bg"
                        colorSchema="danger"
                        onClick={() => {
                          privilegeForm.setValue("temporaryAccess", {
                            isTemporary: false
                          });
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {/* eslint-disable-next-line no-nested-ternary */}
            {privilegeForm.formState.isDirty && privilege ? (
              <>
                <Tooltip content="Cancel" className="mr-4">
                  <IconButton
                    variant="outline_bg"
                    className="border border-mineshaft-500 bg-mineshaft-600 py-2.5 hover:border-red/70 hover:bg-red/20"
                    ariaLabel="delete-privilege"
                    isDisabled={privilegeForm.formState.isSubmitting}
                    onClick={() => privilegeForm.reset()}
                  >
                    <FontAwesomeIcon icon={faArrowRotateLeft} className="py-0.5" />
                  </IconButton>
                </Tooltip>
                <Tooltip
                  content={isMemberEditDisabled ? "Access restricted" : "Save"}
                  className="mr-4"
                >
                  <IconButton
                    isDisabled={isMemberEditDisabled}
                    className="border-none py-3"
                    ariaLabel="save-privilege"
                    type="submit"
                  >
                    {privilegeForm.formState.isSubmitting ? (
                      <Spinner size="xs" className="m-0 h-3 w-3 text-slate-500" />
                    ) : (
                      <FontAwesomeIcon icon={faCheck} className="px-0.5" />
                    )}
                  </IconButton>
                </Tooltip>
              </>
            ) : // eslint-disable-next-line no-nested-ternary
            privilege ? (
              <Tooltip
                content={isMemberEditDisabled ? "Access restricted" : "Delete"}
                className="mr-4"
              >
                <IconButton
                  isDisabled={isMemberEditDisabled}
                  variant="outline_bg"
                  className="border border-mineshaft-500 bg-mineshaft-600 py-3 hover:border-red/70 hover:bg-red/20"
                  ariaLabel="delete-privilege"
                  onClick={() => handlePopUpOpen("deletePrivilege")}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconButton>
              </Tooltip>
            ) : (
              <div />
            )}
          </div>
        </div>
        {!!policies && (
          <Button
            type="submit"
            isLoading={privilegeForm.formState.isSubmitting || requestAccess.isLoading}
            isDisabled={
              isMemberEditDisabled ||
              !policies.length ||
              !privilegeForm.formState.isValid ||
              !secretPath ||
              !accessSelected
            }
            className="mt-4"
            leftIcon={<FontAwesomeIcon icon={faLockOpen} />}
          >
            Request access
          </Button>
        )}
      </form>
      <DeleteActionModal
        isOpen={popUp.deletePrivilege.isOpen}
        title="Remove user additional privilege"
        onChange={(isOpen) => handlePopUpToggle("deletePrivilege", isOpen)}
        deleteKey="delete"
        onClose={() => handlePopUpClose("deletePrivilege")}
        onDeleteApproved={handleDeletePrivilege}
      />
    </div>
  );
};

type Props = {
  membershipId: string;
};

export const SpecificPrivilegeSection = ({ membershipId }: Props) => {
  const { data: userPrivileges, isLoading } = useListProjectUserPrivileges(membershipId);
  const { currentWorkspace } = useWorkspace();

  const createUserPrivilege = useCreateProjectUserAdditionalPrivilege();

  const handleCreatePrivilege = async () => {
    if (createUserPrivilege.isLoading) return;
    try {
      await createUserPrivilege.mutateAsync({
        permissions: [
          {
            action: ProjectPermissionActions.Read,
            subject: [ProjectPermissionSub.Secrets],
            conditions: {
              environment: currentWorkspace?.environments?.[0].slug
            }
          }
        ],
        projectMembershipId: membershipId
      });
      createNotification({
        type: "success",
        text: "Successfully created privilege"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Failed to create privilege"
      });
    }
  };

  return (
    <div className="mt-6 border-t border-t-mineshaft-600 pt-6">
      <div className="flex items-center space-x-2 text-lg font-medium">
        Additional Privileges
        {isLoading && <Spinner size="xs" />}
      </div>
      <p className="mt-0.5 text-sm text-mineshaft-400">
        Select individual privileges to associate with the user.
      </p>
      <div>
        {userPrivileges
          ?.filter(({ permissions }) =>
            permissions?.[0]?.subject?.includes(ProjectPermissionSub.Secrets)
          )
          ?.map((privilege) => (
            <SpecificPrivilegeSecretForm
              privilege={privilege as TProjectUserPrivilege}
              key={privilege?.id}
            />
          ))}
      </div>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Member}>
        {(isAllowed) => (
          <Button
            variant="outline_bg"
            className="mt-4"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={handleCreatePrivilege}
            isLoading={createUserPrivilege.isLoading}
            isDisabled={!isAllowed}
          >
            Add additional privilege
          </Button>
        )}
      </ProjectPermissionCan>
    </div>
  );
};
