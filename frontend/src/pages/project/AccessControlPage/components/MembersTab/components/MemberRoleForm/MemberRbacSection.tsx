/* eslint-disable no-nested-ternary */
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faCaretDown, faClock, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
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
  FormControl,
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
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { useGetProjectRoles, useUpdateUserWorkspaceRole } from "@app/hooks/api";
import { ProjectUserMembershipTemporaryMode } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { TWorkspaceUser } from "@app/hooks/api/types";

const roleFormSchema = z.object({
  roles: z
    .object({
      slug: z.string(),
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
    })
    .array()
});
type TRoleForm = z.infer<typeof roleFormSchema>;

type Props = {
  projectMember: TWorkspaceUser;
  onOpenUpgradeModal: (title: string) => void;
};
export const MemberRbacSection = ({ projectMember, onOpenUpgradeModal }: Props) => {
  const { subscription } = useSubscription();
  const { projectId } = useProject();
  const { data: projectRoles, isPending: isRolesLoading } = useGetProjectRoles(projectId);
  const { permission } = useProjectPermission();
  const isMemberEditDisabled = permission.cannot(
    ProjectPermissionMemberActions.Edit,
    ProjectPermissionSub.Member
  );

  const roleForm = useForm<TRoleForm>({
    resolver: zodResolver(roleFormSchema),
    values: {
      roles: projectMember?.roles?.map(({ customRoleSlug, role, ...dto }) => ({
        slug: customRoleSlug || role,
        temporaryAccess: dto.isTemporary
          ? {
              isTemporary: true,
              temporaryRange: dto.temporaryRange,
              temporaryAccessEndTime: dto.temporaryAccessEndTime,
              temporaryAccessStartTime: dto.temporaryAccessStartTime
            }
          : {
              isTemporary: dto.isTemporary
            }
      }))
    }
  });
  const selectedRoleList = useFieldArray({
    name: "roles",
    control: roleForm.control
  });

  const formRoleField = roleForm.watch("roles");

  const updateMembershipRole = useUpdateUserWorkspaceRole();

  const handleRoleUpdate = async (data: TRoleForm) => {
    if (updateMembershipRole.isPending) return;

    const sanitizedRoles = data.roles.map((el) => {
      const { isTemporary } = el.temporaryAccess;
      if (!isTemporary) {
        return { role: el.slug, isTemporary: false as const };
      }
      return {
        role: el.slug,
        isTemporary: true as const,
        temporaryMode: ProjectUserMembershipTemporaryMode.Relative,
        temporaryRange: el.temporaryAccess.temporaryRange,
        temporaryAccessStartTime: el.temporaryAccess.temporaryAccessStartTime
      };
    });

    const hasCustomRoleSelected = sanitizedRoles.some(
      (el) => !Object.values(ProjectMembershipRole).includes(el.role as ProjectMembershipRole)
    );

    if (
      hasCustomRoleSelected &&
      subscription &&
      !subscription?.get(SubscriptionProductCategory.Platform, "rbac")
    ) {
      onOpenUpgradeModal(
        "You can assign custom roles to members if you upgrade your Infisical plan."
      );
      return;
    }

    await updateMembershipRole.mutateAsync({
      projectId,
      membershipId: projectMember.id,
      roles: sanitizedRoles
    });
    createNotification({ text: "Successfully updated roles", type: "success" });
    roleForm.reset(undefined, { keepValues: true });
  };

  if (isRolesLoading)
    return (
      <div className="flex w-full items-center justify-center p-8">
        <Spinner />
      </div>
    );

  return (
    <div>
      <div className="text-lg font-medium">Roles</div>
      <p className="text-sm text-mineshaft-400">Select one of the pre-defined or custom roles.</p>
      <div>
        <form onSubmit={roleForm.handleSubmit(handleRoleUpdate)}>
          <div className="mt-2 flex flex-col space-y-2">
            {selectedRoleList.fields.map(({ id }, index) => {
              const { temporaryAccess } = formRoleField[index];
              const isTemporary = temporaryAccess?.isTemporary;
              const isExpired =
                temporaryAccess.isTemporary &&
                new Date() > new Date(temporaryAccess.temporaryAccessEndTime || "");

              return (
                <div key={id} className="flex items-center space-x-2">
                  <Controller
                    control={roleForm.control}
                    name={`roles.${index}.slug`}
                    render={({ field: { onChange, ...field } }) => (
                      <Select
                        defaultValue={field.value}
                        {...field}
                        isDisabled={isMemberEditDisabled}
                        onValueChange={(e) => onChange(e)}
                        className="w-full bg-mineshaft-600 duration-200 hover:bg-mineshaft-500"
                      >
                        {projectRoles?.map(({ name, slug, id: projectRoleId }) => (
                          <SelectItem value={slug} key={projectRoleId}>
                            {name}
                          </SelectItem>
                        ))}
                      </Select>
                    )}
                  />
                  <Popover>
                    <PopoverTrigger disabled={isMemberEditDisabled} asChild>
                      <div>
                        <Tooltip
                          content={
                            temporaryAccess?.isTemporary
                              ? isExpired
                                ? "Timed Access Expired"
                                : `Until ${format(
                                    new Date(temporaryAccess.temporaryAccessEndTime || ""),
                                    "yyyy-MM-dd HH:mm:ss"
                                  )}`
                              : "Non expiry access"
                          }
                        >
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
                            {temporaryAccess?.isTemporary
                              ? isExpired
                                ? "Access Expired"
                                : formatDistance(
                                    new Date(temporaryAccess.temporaryAccessEndTime || ""),
                                    new Date()
                                  )
                              : "Permanent"}
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
                          control={roleForm.control}
                          defaultValue="1h"
                          name={`roles.${index}.temporaryAccess.temporaryRange`}
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
                              const temporaryRange = roleForm.getValues(
                                `roles.${index}.temporaryAccess.temporaryRange`
                              );
                              if (!temporaryRange) {
                                roleForm.setError(
                                  `roles.${index}.temporaryAccess.temporaryRange`,
                                  { type: "required", message: "Required" },
                                  { shouldFocus: true }
                                );
                                return;
                              }
                              roleForm.clearErrors(`roles.${index}.temporaryAccess.temporaryRange`);
                              roleForm.setValue(
                                `roles.${index}.temporaryAccess`,
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
                            {temporaryAccess.isTemporary ? "Restart" : "Grant"}
                          </Button>
                          {temporaryAccess.isTemporary && (
                            <Button
                              size="xs"
                              variant="outline_bg"
                              colorSchema="danger"
                              onClick={() => {
                                roleForm.setValue(`roles.${index}.temporaryAccess`, {
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
                  <IconButton
                    variant="outline_bg"
                    className="border border-mineshaft-500 bg-mineshaft-600 py-3 hover:border-red/70 hover:bg-red/20"
                    ariaLabel="delete-role"
                    isDisabled={isMemberEditDisabled || selectedRoleList.fields.length === 1}
                    onClick={() => {
                      if (selectedRoleList.fields.length > 1) {
                        selectedRoleList.remove(index);
                      }
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-between space-x-2">
            <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Member}>
              {(isAllowed) => (
                <Button
                  variant="outline_bg"
                  isDisabled={!isAllowed}
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() =>
                    selectedRoleList.append({
                      slug: ProjectMembershipRole.Member,
                      temporaryAccess: { isTemporary: false }
                    })
                  }
                >
                  Add Role
                </Button>
              )}
            </ProjectPermissionCan>
            <Button
              type="submit"
              className={twMerge(
                "transition-all",
                "cursor-default opacity-0",
                roleForm.formState.isDirty && "cursor-pointer opacity-100"
              )}
              isDisabled={!roleForm.formState.isDirty}
              isLoading={roleForm.formState.isSubmitting}
            >
              Save Roles
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
