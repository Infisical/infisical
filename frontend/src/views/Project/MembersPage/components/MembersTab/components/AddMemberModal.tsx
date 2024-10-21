import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { faCheckCircle, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormControl,
  Modal,
  ModalContent,
  MultiSelect
} from "@app/components/v2";
import { useOrganization, useWorkspace } from "@app/context";
import {
  useAddUsersToOrg,
  useGetOrgUsers,
  useGetProjectRoles,
  useGetWorkspaceUsers
} from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { ProjectVersion } from "@app/hooks/api/workspace/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const addMemberFormSchema = z.object({
  orgMemberships: z.array(z.object({ label: z.string().trim(), value: z.string().trim() })).min(1),
  projectRoleSlugs: z.array(z.string().trim().min(1)).min(1)
});

type TAddMemberForm = z.infer<typeof addMemberFormSchema>;

type Props = {
  popUp: UsePopUpState<["addMember"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addMember"]>, state?: boolean) => void;
};

export const AddMemberModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();

  const orgId = currentOrg?.id || "";
  const workspaceId = currentWorkspace?.id || "";

  const { data: members } = useGetWorkspaceUsers(workspaceId);
  const { data: orgUsers } = useGetOrgUsers(orgId);

  const { data: roles } = useGetProjectRoles(currentWorkspace?.slug || "");

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<TAddMemberForm>({
    resolver: zodResolver(addMemberFormSchema),
    defaultValues: { orgMemberships: [], projectRoleSlugs: [ProjectMembershipRole.Member] }
  });

  const { mutateAsync: addMembersToProject } = useAddUsersToOrg();

  const onAddMembers = async ({ orgMemberships, projectRoleSlugs }: TAddMemberForm) => {
    if (!currentWorkspace) return;
    if (!currentOrg?.id) return;

    const selectedMembers = orgMemberships.map((orgMembership) =>
      orgUsers?.find((orgUser) => orgUser.id === orgMembership.value)
    );

    if (!selectedMembers) return;

    try {
      if (currentWorkspace.version === ProjectVersion.V1) {
        createNotification({
          type: "error",
          text: "Please upgrade your project to invite new members to the project."
        });
      } else {
        await addMembersToProject({
          inviteeEmails: selectedMembers.map((member) => member?.user.username!),
          organizationId: orgId,
          organizationRoleSlug: ProjectMembershipRole.Member, // ? This doesn't apply in this case, because we know the users being added are already part of the organization
          projects: [
            {
              slug: currentWorkspace.slug,
              id: currentWorkspace.id,
              projectRoleSlug: projectRoleSlugs
            }
          ]
        });
      }
      createNotification({
        text: "Successfully added user to the project",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to add user to project",
        type: "error"
      });
    }
    handlePopUpToggle("addMember", false);
    reset();
  };

  const filteredOrgUsers = useMemo(() => {
    const wsUserUsernames = new Map();
    members?.forEach((member) => {
      wsUserUsernames.set(member.user.username, true);
    });
    return (orgUsers || [])
      .filter(({ user: u }) => !wsUserUsernames.has(u.username))
      .map((member) => ({
        value: member.id,
        label: `${member.user.firstName} ${member.user.lastName}`
      }));
  }, [orgUsers, members]);

  const selectedOrgMemberships = watch("orgMemberships");
  const selectedRoleSlugs = watch("projectRoleSlugs");

  return (
    <Modal
      isOpen={popUp?.addMember?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("addMember", isOpen)}
    >
      <ModalContent
        bodyClassName="overflow-visible"
        title={t("section.members.add-dialog.add-member-to-project") as string}
        subTitle={t("section.members.add-dialog.user-will-email")}
      >
        {filteredOrgUsers.length ? (
          <form onSubmit={handleSubmit(onAddMembers)}>
            <div className="flex w-full flex-col items-start gap-2">
              <Controller
                control={control}
                name="orgMemberships"
                render={({ field }) => (
                  <FormControl
                    className="w-full"
                    isError={!!errors.orgMemberships?.length}
                    errorText={errors.orgMemberships?.[0]?.message}
                    label="Invite users to project"
                  >
                    <MultiSelect
                      className="w-full"
                      placeholder="Add one or more users..."
                      isMulti
                      name="members"
                      options={filteredOrgUsers}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="projectRoleSlugs"
                render={({ field }) => (
                  <FormControl
                    className="w-full"
                    label="Select roles"
                    tooltipText="Select the roles that you wish to assign to the users"
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        {roles && roles.length > 0 ? (
                          <div className="inline-flex w-full cursor-pointer items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none data-[placeholder]:text-mineshaft-200">
                            {/* eslint-disable-next-line no-nested-ternary */}
                            {selectedRoleSlugs.length === 1
                              ? roles.find((role) => role.slug === selectedRoleSlugs[0])?.name
                              : selectedRoleSlugs.length === 0
                              ? "Select at least one role"
                              : `${selectedRoleSlugs.length} roles selected`}
                            <FontAwesomeIcon
                              icon={faChevronDown}
                              className={twMerge("ml-2 text-xs")}
                            />
                          </div>
                        ) : (
                          <div className="inline-flex w-full cursor-default items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none data-[placeholder]:text-mineshaft-200">
                            No roles found
                          </div>
                        )}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="thin-scrollbar z-[100] max-h-80"
                      >
                        {roles && roles.length > 0 ? (
                          roles.map((role) => {
                            const isSelected = selectedRoleSlugs.includes(role.slug);

                            return (
                              <DropdownMenuItem
                                onSelect={(event) => roles.length > 1 && event.preventDefault()}
                                onClick={() => {
                                  if (selectedRoleSlugs.includes(String(role.slug))) {
                                    field.onChange(
                                      selectedRoleSlugs.filter(
                                        (roleSlug: string) => roleSlug !== String(role.slug)
                                      )
                                    );
                                  } else {
                                    field.onChange([...selectedRoleSlugs, role.slug]);
                                  }
                                }}
                                key={`role-slug-${role.slug}`}
                                icon={
                                  isSelected ? (
                                    <FontAwesomeIcon
                                      icon={faCheckCircle}
                                      className="pr-0.5 text-primary"
                                    />
                                  ) : (
                                    <div className="pl-[1.01rem]" />
                                  )
                                }
                                iconPos="left"
                                className="w-[28.4rem] text-sm"
                              >
                                {role.name}
                              </DropdownMenuItem>
                            );
                          })
                        ) : (
                          <div />
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </FormControl>
                )}
              />
            </div>
            <div className="mt-8 flex items-center">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={
                  isSubmitting ||
                  selectedOrgMemberships.length === 0 ||
                  selectedRoleSlugs.length === 0
                }
              >
                Add Members
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpToggle("addMember", false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col space-y-4">
            <div>All the users in your organization are already invited.</div>
            <Link href={`/org/${currentWorkspace?.orgId}/members`}>
              <Button variant="outline_bg">Add users to organization</Button>
            </Link>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
