import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faClock, faEdit, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FormControl,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Tag,
  Tooltip
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useGetProjectRoles, useUpdateGroupWorkspaceRole } from "@app/hooks/api";
import { TGroupMembership } from "@app/hooks/api/groups/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { ProjectUserMembershipTemporaryMode } from "@app/hooks/api/workspace/types";
import { groupBy } from "@app/lib/fn/array";

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
      <PopoverTrigger>
        <IconButton ariaLabel="role-temp" variant="plain" size="md">
          <Tooltip content={isExpired ? "Access Expired" : "Grant Temporary Access"}>
            <FontAwesomeIcon
              icon={faClock}
              className={twMerge(
                isTemporaryFieldValue && "text-primary",
                isExpired && "text-red-600"
              )}
            />
          </Tooltip>
        </IconButton>
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
            Set Role Temporarily
          </div>
          {isExpired && <Tag colorSchema="red">Expired</Tag>}
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
                      className="text-primary-700"
                    >
                      More
                    </a>
                  </span>
                }
              >
                <Input {...field} />
              </FormControl>
            )}
          />
          <div className="flex items-center space-x-2">
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
                variant="outline_bg"
                colorSchema="danger"
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
  roles: TGroupMembership["roles"];
};

const MAX_ROLES_TO_BE_SHOWN_IN_TABLE = 2;

export const GroupRoles = ({ roles = [], disableEdit = false, groupId }: TMemberRolesProp) => {
  const { currentWorkspace } = useWorkspace();
  const { popUp, handlePopUpToggle } = usePopUp(["editRole"] as const);
  const [searchRoles, setSearchRoles] = useState("");

  const {
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { isSubmitting, isDirty }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema)
  });

  const { data: projectRoles, isLoading: isRolesLoading } = useGetProjectRoles(
    currentWorkspace?.id ?? ""
  );
  const userRolesGroupBySlug = groupBy(roles, ({ customRoleSlug, role }) => customRoleSlug || role);

  const updateGroupWorkspaceRole = useUpdateGroupWorkspaceRole();

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

    try {
      await updateGroupWorkspaceRole.mutateAsync({
        projectId: currentWorkspace?.id || "",
        groupId,
        roles: selectedRoles
      });
      createNotification({ text: "Successfully updated group role", type: "success" });
      handlePopUpToggle("editRole");
      setSearchRoles("");
    } catch (err) {
      createNotification({ text: "Failed to update group role", type: "error" });
    }
  };

  const formatRoleName = (role: string, customRoleName?: string) => {
    if (role === ProjectMembershipRole.Custom) return customRoleName;
    if (role === ProjectMembershipRole.Member) return "Developer";
    return role;
  };

  return (
    <div className="flex items-center space-x-2">
      {roles
        .slice(0, MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
        .map(({ role, customRoleName, id, isTemporary, temporaryAccessEndTime }) => {
          const isExpired = new Date() > new Date(temporaryAccessEndTime || ("" as string));
          return (
            <Tag key={id} className="capitalize">
              <div className="flex items-center space-x-2">
                <div>{formatRoleName(role, customRoleName)}</div>
                {isTemporary && (
                  <div>
                    <Tooltip content={isExpired ? "Expired Temporary Access" : "Temporary Access"}>
                      <FontAwesomeIcon
                        icon={faClock}
                        className={twMerge(isExpired && "text-red-600")}
                      />
                    </Tooltip>
                  </div>
                )}
              </div>
            </Tag>
          );
        })}
      {roles.length > MAX_ROLES_TO_BE_SHOWN_IN_TABLE && (
        <HoverCard>
          <HoverCardTrigger>
            <Tag>+{roles.length - MAX_ROLES_TO_BE_SHOWN_IN_TABLE}</Tag>
          </HoverCardTrigger>
          <HoverCardContent className="border border-gray-700 bg-mineshaft-800 p-4">
            {roles
              .slice(MAX_ROLES_TO_BE_SHOWN_IN_TABLE)
              .map(({ role, customRoleName, id, isTemporary, temporaryAccessEndTime }) => {
                const isExpired = new Date() > new Date(temporaryAccessEndTime || ("" as string));
                return (
                  <Tag key={id} className="capitalize">
                    <div className="flex items-center space-x-2">
                      <div>{formatRoleName(role, customRoleName)}</div>
                      {isTemporary && (
                        <div>
                          <Tooltip
                            content={isExpired ? "Expired Temporary Access" : "Temporary Access"}
                          >
                            <FontAwesomeIcon
                              icon={faClock}
                              className={twMerge(
                                new Date() > new Date(temporaryAccessEndTime as string) &&
                                  "text-red-600"
                              )}
                            />
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </Tag>
                );
              })}{" "}
          </HoverCardContent>
        </HoverCard>
      )}
      <div>
        <Popover
          open={popUp.editRole.isOpen}
          onOpenChange={(isOpen) => {
            handlePopUpToggle("editRole", isOpen);
            reset();
          }}
        >
          {!disableEdit && (
            <PopoverTrigger>
              <IconButton size="sm" variant="plain" ariaLabel="update">
                <FontAwesomeIcon icon={faEdit} />
              </IconButton>
            </PopoverTrigger>
          )}
          <PopoverContent hideCloseBtn className="pt-4">
            {isRolesLoading ? (
              <div className="flex h-8 w-full items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <form onSubmit={handleSubmit(handleRoleUpdate)} id="role-update-form">
                <div className="thin-scrollbar max-h-80 space-y-4 overflow-y-auto">
                  {projectRoles
                    ?.filter(
                      ({ name, slug }) =>
                        name.toLowerCase().includes(searchRoles.toLowerCase()) ||
                        slug.toLowerCase().includes(searchRoles.toLowerCase())
                    )
                    ?.map(({ id, name, slug }) => {
                      const userProjectRoleDetails = userRolesGroupBySlug?.[slug]?.[0];

                      return (
                        <div key={id} className="flex items-center space-x-4">
                          <div className="flex-grow">
                            <Controller
                              control={control}
                              defaultValue={Boolean(userProjectRoleDetails?.id)}
                              name={`${slug}.isChecked`}
                              render={({ field }) => (
                                <Checkbox
                                  id={slug}
                                  isChecked={field.value}
                                  onCheckedChange={(isChecked) => {
                                    field.onChange(isChecked);
                                    setValue(`${slug}.temporaryAccess`, false);
                                  }}
                                >
                                  {name}
                                </Checkbox>
                              )}
                            />
                          </div>
                          <div>
                            <Controller
                              control={control}
                              name={`${slug}.temporaryAccess`}
                              defaultValue={
                                userProjectRoleDetails?.isTemporary
                                  ? {
                                      isTemporary: true,
                                      temporaryAccessStartTime:
                                        userProjectRoleDetails.temporaryAccessStartTime as string,
                                      temporaryRange:
                                        userProjectRoleDetails.temporaryRange as string,
                                      temporaryAccessEndTime:
                                        userProjectRoleDetails.temporaryAccessEndTime
                                    }
                                  : false
                              }
                              render={({ field }) => (
                                <IdentityTemporaryRoleForm
                                  temporaryConfig={
                                    typeof field.value === "boolean"
                                      ? { isTemporary: field.value }
                                      : field.value
                                  }
                                  onSetTemporary={(data) => {
                                    setValue(`${slug}.isChecked`, true, { shouldDirty: true });
                                    field.onChange({ isTemporary: true, ...data });
                                  }}
                                  onRemoveTemporary={() => {
                                    setValue(`${slug}.isChecked`, false, { shouldDirty: true });
                                    field.onChange(false);
                                  }}
                                />
                              )}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className="mt-3 flex items-center space-x-2 border-t border-t-gray-700 pt-3">
                  <div>
                    <Input
                      className="w-full p-1.5 pl-8"
                      size="xs"
                      value={searchRoles}
                      onChange={(el) => setSearchRoles(el.target.value)}
                      leftIcon={<FontAwesomeIcon icon={faSearch} />}
                      placeholder="Search roles.."
                    />
                  </div>
                  <div>
                    <Button
                      size="xs"
                      type="submit"
                      form="role-update-form"
                      leftIcon={<FontAwesomeIcon icon={faCheck} />}
                      isDisabled={!isDirty || isSubmitting}
                      isLoading={isSubmitting}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
