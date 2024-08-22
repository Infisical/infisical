import { Controller, useForm } from "react-hook-form";
import {
  faArrowRotateLeft,
  faCaretDown,
  faCheck,
  faClock,
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
  useCreateIdentityProjectAdditionalPrivilege,
  useDeleteIdentityProjectAdditionalPrivilege,
  useUpdateIdentityProjectAdditionalPrivilege
} from "@app/hooks/api";
import { useListIdentityProjectPrivileges } from "@app/hooks/api/identityProjectAdditionalPrivilege/queries";

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
const SpecificPrivilegeSecretForm = ({
  privilege,
  identityId
}: {
  privilege: TProjectUserPrivilege;
  identityId: string;
}) => {
  const { currentWorkspace } = useWorkspace();
  const projectSlug = currentWorkspace?.slug || "";

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deletePrivilege"
  ] as const);
  const { permission } = useProjectPermission();
  const isMemberEditDisabled = permission.cannot(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Identity
  );

  const updateIdentityPrivilege = useUpdateIdentityProjectAdditionalPrivilege();
  const deleteIdentityPrivilege = useDeleteIdentityProjectAdditionalPrivilege();

  const privilegeForm = useForm<TSecretPermissionForm>({
    resolver: zodResolver(secretPermissionSchema),
    values: {
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
  });

  const temporaryAccessField = privilegeForm.watch("temporaryAccess");
  const selectedEnvironmentSlug = privilegeForm.watch("environmentSlug");
  const isTemporary = temporaryAccessField?.isTemporary;
  const isExpired =
    temporaryAccessField.isTemporary &&
    new Date() > new Date(temporaryAccessField.temporaryAccessEndTime || "");

  const handleUpdatePrivilege = async (data: TSecretPermissionForm) => {
    if (updateIdentityPrivilege.isLoading) return;
    try {
      const actions = [
        { action: ProjectPermissionActions.Read, allowed: data.read },
        { action: ProjectPermissionActions.Create, allowed: data.create },
        { action: ProjectPermissionActions.Delete, allowed: data.delete },
        { action: ProjectPermissionActions.Edit, allowed: data.edit }
      ];
      await updateIdentityPrivilege.mutateAsync({
        privilegeDetails: {
          ...data.temporaryAccess,
          privilegePermission: {
            actions: actions.filter(({ allowed }) => allowed).map(({ action }) => action),
            subject: ProjectPermissionSub.Secrets,
            conditions: {
              environment: data.environmentSlug,
              ...(data.secretPath ? { secretPath: { $glob: data.secretPath } } : {})
            }
          }
        },
        privilegeSlug: privilege.slug,
        identityId,
        projectSlug
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
    if (deleteIdentityPrivilege.isLoading) return;
    try {
      await deleteIdentityPrivilege.mutateAsync({
        identityId,
        privilegeSlug: privilege.slug,
        projectSlug
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

  const getAccessLabel = (exactTime = false) => {
    if (isExpired) return "Access expired";
    if (!temporaryAccessField?.isTemporary) return "Permanent";
    if (exactTime)
      return `Until ${format(
        new Date(temporaryAccessField.temporaryAccessEndTime || ""),
        "yyyy-MM-dd HH:mm:ss"
      )}`;
    return formatDistance(new Date(temporaryAccessField.temporaryAccessEndTime || ""), new Date());
  };

  return (
    <div className="mt-4">
      <form onSubmit={privilegeForm.handleSubmit(handleUpdatePrivilege)}>
        <div className="flex items-start space-x-4">
          <Controller
            control={privilegeForm.control}
            name="environmentSlug"
            render={({ field: { onChange, ...field } }) => (
              <FormControl label="Env">
                <Select
                  {...field}
                  isDisabled={isMemberEditDisabled}
                  className="bg-mineshaft-600 hover:bg-mineshaft-500"
                  onValueChange={(e) => onChange(e)}
                >
                  {currentWorkspace?.environments?.map(({ slug, id }) => (
                    <SelectItem value={slug} key={id}>
                      {slug}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={privilegeForm.control}
            name="secretPath"
            render={({ field }) => (
              <FormControl label="Secret Path">
                <SecretPathInput
                  {...field}
                  isDisabled={isMemberEditDisabled}
                  environment={selectedEnvironmentSlug}
                  containerClassName="w-48"
                />
              </FormControl>
            )}
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
          <div className="mt-7 flex items-center space-x-2">
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
                      {getAccessLabel()}
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
                      {temporaryAccessField.isTemporary ? "Restart" : "Grant"}
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
                        Revoke Access
                      </Button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {privilegeForm.formState.isDirty ? (
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
            ) : (
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
            )}
          </div>
        </div>
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
  identityId: string;
};

export const SpecificPrivilegeSection = ({ identityId }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectSlug = currentWorkspace?.slug || "";
  const { data: identityPrivileges, isLoading } = useListIdentityProjectPrivileges({
    identityId,
    projectSlug
  });

  const createIdentityPrivilege = useCreateIdentityProjectAdditionalPrivilege();

  const handleCreatePrivilege = async () => {
    if (createIdentityPrivilege.isLoading) return;
    try {
      await createIdentityPrivilege.mutateAsync({
        privilegePermission: {
          actions: [ProjectPermissionActions.Read],
          subject: ProjectPermissionSub.Secrets,
          conditions: {
            environment: currentWorkspace?.environments?.[0].slug as string
          }
        },
        identityId,
        projectSlug
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
        Select individual privileges to associate with the identity.
      </p>
      <div>
        {identityPrivileges
          ?.filter(({ permissions }) =>
            permissions?.[0]?.subject?.includes(ProjectPermissionSub.Secrets)
          )
          .sort((a, b) => a.id.localeCompare(b.id))
          ?.map((privilege) => (
            <SpecificPrivilegeSecretForm
              privilege={privilege as TProjectUserPrivilege}
              identityId={identityId}
              key={privilege?.id}
            />
          ))}
      </div>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Identity}>
        {(isAllowed) => (
          <Button
            variant="outline_bg"
            className="mt-4"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            onClick={handleCreatePrivilege}
            isLoading={createIdentityPrivilege.isLoading}
            isDisabled={!isAllowed}
          >
            Add additional privilege
          </Button>
        )}
      </ProjectPermissionCan>
    </div>
  );
};
