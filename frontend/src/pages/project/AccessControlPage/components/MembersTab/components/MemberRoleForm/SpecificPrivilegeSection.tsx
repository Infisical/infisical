/* eslint-disable jsx-a11y/label-has-associated-control */
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { faEye, faTrashCan } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowRotateLeft,
  faCaretDown,
  faCheck,
  faClock,
  faLockOpen,
  faPencil,
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
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { removeTrailingSlash } from "@app/helpers/string";
import { usePopUp } from "@app/hooks";
import {
  TProjectUserPrivilege,
  useCreateAccessRequest,
  useDeleteProjectUserAdditionalPrivilege
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
  ]),
  note: z.string().optional()
});
type TSecretPermissionForm = z.infer<typeof secretPermissionSchema>;
export const SpecificPrivilegeSecretForm = ({
  privilege,
  policies,
  onClose,
  selectedActions = [],
  secretPath: initialSecretPath
}: {
  privilege?: TProjectUserPrivilege;
  policies?: TAccessApprovalPolicy[];
  selectedActions?: ProjectPermissionActions[];
  secretPath?: string;
  onClose?: () => void;
}) => {
  const { currentWorkspace } = useWorkspace();

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deletePrivilege",
    "requestAccess"
  ] as const);
  const { permission } = useProjectPermission();
  const isMemberEditDisabled =
    permission.cannot(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member) &&
    Boolean(privilege);

  const deleteUserPrivilege = useDeleteProjectUserAdditionalPrivilege();
  const requestAccess = useCreateAccessRequest();

  const privilegeForm = useForm<TSecretPermissionForm>({
    resolver: zodResolver(secretPermissionSchema),
    values: {
      ...(privilege
        ? {
            environmentSlug: privilege.permissions?.[0]?.conditions?.environment,
            // secret path will be inside $glob operator
            secretPath: privilege.permissions?.[0]?.conditions?.secretPath?.$glob
              ? removeTrailingSlash(privilege.permissions?.[0]?.conditions?.secretPath?.$glob)
              : "",
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
            environmentSlug: currentWorkspace.environments?.[0]?.slug,
            secretPath: initialSecretPath,
            read: selectedActions.includes(ProjectPermissionActions.Read),
            edit: selectedActions.includes(ProjectPermissionActions.Edit),
            create: selectedActions.includes(ProjectPermissionActions.Create),
            delete: selectedActions.includes(ProjectPermissionActions.Delete),
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

  const handleDeletePrivilege = async () => {
    if (!privilege) {
      createNotification({
        type: "error",
        text: "No privilege to delete found.",
        title: "Error"
      });
      return;
    }

    if (deleteUserPrivilege.isPending) return;
    try {
      await deleteUserPrivilege.mutateAsync({
        privilegeId: privilege.id,
        projectMembershipId: privilege.projectMembershipId
      });
      createNotification({
        type: "success",
        text: "Successfully deleted privilege"
      });
    } catch {
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
        text: "Please select a secret path...",
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
        })),
      note: data.note
    });

    createNotification({
      type: "success",
      text: "Successfully requested access"
    });
    privilegeForm.reset();
    if (onClose) onClose();
  };

  const handleSubmit = async (data: TSecretPermissionForm) => {
    handleRequestAccess(data);
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
    <div className="w-full">
      <form onSubmit={privilegeForm.handleSubmit(handleSubmit)}>
        <div className={twMerge("flex items-start", !privilege && "flex-col")}>
          <Controller
            control={privilegeForm.control}
            name="environmentSlug"
            render={({ field: { onChange, ...field } }) => (
              <FormControl label="Environment" className="w-full">
                <Select
                  {...field}
                  isDisabled={isMemberEditDisabled}
                  className="w-full bg-mineshaft-900 hover:bg-mineshaft-800"
                  onValueChange={(e) => onChange(e)}
                  position="popper"
                  dropdownContainerClassName="max-w-none"
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
                    <div className="w-full">
                      <FormControl label="Secret Path">
                        <Select
                          {...field}
                          isDisabled={isMemberEditDisabled || !selectablePaths.length}
                          className="w-full hover:bg-mineshaft-800"
                          placeholder="Select a secret path"
                          onValueChange={(e) => field.onChange(e)}
                          position="popper"
                          dropdownContainerClassName="max-w-none"
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
          <FormControl label="Permissions" className="w-full">
            <div className="flex w-full flex-col justify-between">
              <div className="flex w-full flex-row gap-2">
                <Controller
                  control={privilegeForm.control}
                  name="read"
                  render={({ field }) => (
                    <label
                      className={`group my-1 flex w-full cursor-pointer flex-row items-center justify-start gap-2 rounded-md border border-mineshaft-600 bg-mineshaft-900 p-3 duration-100 hover:border-primary/30 hover:bg-primary/10 ${field.value ? "border-primary/50 bg-primary/10 hover:border-primary/50" : ""}`}
                      htmlFor="secret-read"
                    >
                      <Checkbox
                        isDisabled={isMemberEditDisabled}
                        id="secret-read"
                        className={`mx-2 h-5 w-5 ${field.value ? "hover:bg-primary/40" : ""}`}
                        isChecked={field.value}
                        onCheckedChange={(isChecked) => field.onChange(isChecked)}
                      />
                      <div className="pointer-events-none ml-1 flex select-none flex-col text-mineshaft-300">
                        <div className="flex flex-row items-center gap-1">
                          <FontAwesomeIcon
                            icon={faEye}
                            className={`text-sm ${field.value ? "text-primary-200" : ""}`}
                          />
                          <FormLabel
                            label="View"
                            className={`my-0 ml-0.5 text-mineshaft-300 ${field.value ? "text-primary-200" : ""}`}
                          />
                        </div>
                        <p className="text-xs text-mineshaft-400">Read secret values</p>
                      </div>
                    </label>
                  )}
                />
                <Controller
                  control={privilegeForm.control}
                  name="create"
                  render={({ field }) => (
                    <label
                      className={`group my-1 flex w-full cursor-pointer flex-row items-center justify-start gap-2 rounded-md border border-mineshaft-600 bg-mineshaft-900 p-3 duration-100 hover:border-primary/30 hover:bg-primary/10 ${field.value ? "border-primary/50 bg-primary/10 hover:border-primary/50" : ""}`}
                      htmlFor="secret-change"
                    >
                      <Checkbox
                        isDisabled={isMemberEditDisabled}
                        id="secret-change"
                        className={`mx-2 h-5 w-5 ${field.value ? "hover:bg-primary/40" : ""}`}
                        isChecked={field.value}
                        onCheckedChange={(isChecked) => field.onChange(isChecked)}
                      />
                      <div className="pointer-events-none ml-1 flex select-none flex-col text-mineshaft-300">
                        <div className="flex flex-row items-center gap-1">
                          <FontAwesomeIcon
                            icon={faPlus}
                            className={`text-sm ${field.value ? "text-primary-200" : ""}`}
                          />
                          <FormLabel
                            label="Create"
                            className={`my-0 ml-0.5 text-mineshaft-300 ${field.value ? "text-primary-200" : ""}`}
                          />
                        </div>
                        <p className="text-xs text-mineshaft-400">Create new secrets</p>
                      </div>
                    </label>
                  )}
                />
              </div>
              <div className="flex w-full flex-row gap-2">
                <Controller
                  control={privilegeForm.control}
                  name="edit"
                  render={({ field }) => (
                    <label
                      className={`group my-1 flex w-full cursor-pointer flex-row items-center justify-start gap-2 rounded-md border border-mineshaft-600 bg-mineshaft-900 p-3 duration-100 hover:border-primary/30 hover:bg-primary/10 ${field.value ? "border-primary/50 bg-primary/10 hover:border-primary/50" : ""}`}
                      htmlFor="secret-modify"
                    >
                      <Checkbox
                        isDisabled={isMemberEditDisabled}
                        id="secret-modify"
                        className={`mx-2 h-5 w-5 ${field.value ? "hover:bg-primary/40" : ""}`}
                        isChecked={field.value}
                        onCheckedChange={(isChecked) => field.onChange(isChecked)}
                      />
                      <div className="pointer-events-none ml-1 flex select-none flex-col text-mineshaft-300">
                        <div className="flex flex-row items-center gap-1">
                          <FontAwesomeIcon
                            icon={faPencil}
                            className={`text-sm ${field.value ? "text-primary-200" : ""}`}
                          />
                          <FormLabel
                            label="Modify"
                            className={`my-0 ml-0.5 text-mineshaft-300 ${field.value ? "text-primary-200" : ""}`}
                          />
                        </div>
                        <p className="text-xs text-mineshaft-400">Update existing secrets</p>
                      </div>
                    </label>
                  )}
                />
                <Controller
                  control={privilegeForm.control}
                  name="delete"
                  render={({ field }) => (
                    <label
                      className={`group my-1 flex w-full cursor-pointer flex-row items-center justify-start gap-2 rounded-md border border-mineshaft-600 bg-mineshaft-900 p-3 duration-100 hover:border-primary/30 hover:bg-primary/10 ${field.value ? "border-primary/50 bg-primary/10 hover:border-primary/50" : ""}`}
                      htmlFor="secret-delete"
                    >
                      <Checkbox
                        isDisabled={isMemberEditDisabled}
                        id="secret-delete"
                        className={`mx-2 h-5 w-5 ${field.value ? "hover:bg-primary/40" : ""}`}
                        isChecked={field.value}
                        onCheckedChange={(isChecked) => field.onChange(isChecked)}
                      />
                      <div className="pointer-events-none ml-1 flex select-none flex-col text-mineshaft-300">
                        <div className="flex flex-row items-center gap-1">
                          <FontAwesomeIcon
                            icon={faTrashCan}
                            className={`text-sm ${field.value ? "text-primary-200" : ""}`}
                          />
                          <FormLabel
                            label="Delete"
                            className={`my-0 ml-0.5 text-mineshaft-300 ${field.value ? "text-primary-200" : ""}`}
                          />
                        </div>
                        <p className="text-xs text-mineshaft-400">Delete existing secrets</p>
                      </div>
                    </label>
                  )}
                />
              </div>
            </div>
          </FormControl>
          <FormControl label="Time Period" className="w-full">
            <div className="mt-1 flex w-full items-center space-x-2">
              <Popover>
                <PopoverTrigger disabled={isMemberEditDisabled}>
                  <div className="w-full">
                    <Tooltip content={getAccessLabel(true)}>
                      <Button
                        variant="outline_bg"
                        leftIcon={isTemporary ? <FontAwesomeIcon icon={faClock} /> : undefined}
                        rightIcon={<FontAwesomeIcon icon={faCaretDown} className="ml-4" />}
                        isDisabled={isMemberEditDisabled}
                        className={twMerge(
                          "w-full border-mineshaft-600 bg-mineshaft-900 py-2.5 text-sm capitalize text-mineshaft-300 hover:border-mineshaft-600 hover:bg-mineshaft-800",
                          isExpired && "text-red-600"
                        )}
                      >
                        {getAccessLabel(false)}
                      </Button>
                    </Tooltip>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  arrowClassName="fill-mineshaft-600"
                  side="right"
                  sideOffset={12}
                  hideCloseBtn
                  className="border border-mineshaft-600 bg-mineshaft-800 pt-4"
                >
                  <div className="flex flex-col space-y-4">
                    <div className="text-sm text-mineshaft-300">Configure timed access</div>
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
          </FormControl>
        </div>
        <div className="mb-4 flex w-full">
          <Controller
            control={privilegeForm.control}
            name="note"
            render={({ field }) => (
              <div className="w-full">
                <FormLabel label="Note" className="mb-2" />
                <Input
                  {...field}
                  isDisabled={isMemberEditDisabled}
                  maxLength={255}
                  placeholder="Add the reason for this access request..."
                  className="text-mineshaft-300"
                />
              </div>
            )}
          />
        </div>
        {!!policies && (
          <Button
            type="submit"
            variant="outline_bg"
            isLoading={privilegeForm.formState.isSubmitting || requestAccess.isPending}
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
            Request Access
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
