import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Modal, ModalContent } from "@app/components/v2";
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
  projectRoleSlugs: z.array(z.object({ slug: z.string().trim(), name: z.string().trim() })).min(1)
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

  const { data: roles } = useGetProjectRoles(currentWorkspace?.id || "");

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<TAddMemberForm>({
    resolver: zodResolver(addMemberFormSchema),
    defaultValues: { orgMemberships: [], projectRoleSlugs: [] }
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
        const inviteeEmails = selectedMembers
          .map((member) => member?.user.username as string)
          .filter(Boolean);
        if (inviteeEmails.length) {
          await addMembersToProject({
            inviteeEmails,
            organizationId: orgId,
            organizationRoleSlug: ProjectMembershipRole.Member, // ? This doesn't apply in this case, because we know the users being added are already part of the organization
            projects: [
              {
                slug: currentWorkspace.slug,
                id: currentWorkspace.id,
                projectRoleSlug: projectRoleSlugs.map((role) => role.slug)
              }
            ]
          });
        }
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
      .map(({ id, inviteEmail, user: { firstName, lastName, email } }) => ({
        value: id,
        label:
          firstName && lastName
            ? `${firstName} ${lastName}`
            : firstName || lastName || email || inviteEmail
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
                    <FilterableSelect
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
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <FormControl
                    className="w-full"
                    label="Select roles"
                    tooltipText="Select the roles that you wish to assign to the users"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <FilterableSelect
                      options={roles}
                      placeholder="Select roles..."
                      value={value}
                      onChange={onChange}
                      isMulti
                      getOptionValue={(option) => option.slug}
                      getOptionLabel={(option) => option.name}
                    />
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
            <Link to={"/organization/access-management" as const}>
              <Button variant="outline_bg">Add users to organization</Button>
            </Link>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
