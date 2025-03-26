import { useMemo } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Modal, ModalContent } from "@app/components/v2";
import { CreatableSelect } from "@app/components/v2/CreatableSelect";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useWorkspace
} from "@app/context";
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
  orgMemberships: z
    .array(
      z.object({
        label: z.string().trim(),
        value: z.string().trim(),
        isNewInvitee: z.boolean().optional()
      })
    )
    .min(1),
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
  const { permission } = useOrgPermission();

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

    const existingMembers = orgMemberships.filter((membership) => !membership.isNewInvitee);
    const newInvitees = orgMemberships
      .filter((membership) => membership.isNewInvitee)
      .map((membership) => membership.value);

    const selectedMembers = existingMembers.map((orgMembership) =>
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
        if (inviteeEmails.length || newInvitees.length) {
          await addMembersToProject({
            inviteeEmails: [...inviteeEmails, ...newInvitees],
            organizationId: orgId,
            organizationRoleSlug: ProjectMembershipRole.Member, // only applies to new invites
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

  const { append } = useFieldArray<TAddMemberForm>({ control, name: "orgMemberships" });

  const canInviteNewMembers = permission.can(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.Member
  );

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
                  helperText={
                    canInviteNewMembers
                      ? "You can invite new users to your organization by typing out their email address"
                      : undefined
                  }
                >
                  {canInviteNewMembers ? (
                    <CreatableSelect
                      /* eslint-disable-next-line react/no-unstable-nested-components */
                      noOptionsMessage={() => (
                        <>
                          <p>
                            {!filteredOrgUsers.length && (
                              <p>All organization members are already assigned to this project.</p>
                            )}
                          </p>
                          <p>
                            Invite new users to your organization by typing out their email address.
                          </p>
                        </>
                      )}
                      onCreateOption={(inputValue) =>
                        append({ label: inputValue, value: inputValue, isNewInvitee: true })
                      }
                      formatCreateLabel={(inputValue) => `Invite "${inputValue}"`}
                      isValidNewOption={(input) =>
                        Boolean(input) &&
                        z.string().email().safeParse(input).success &&
                        !orgUsers
                          ?.flatMap(({ user }) => {
                            const emails: string[] = [];

                            if (user.email) {
                              emails.push(user.email);
                            }

                            if (user.username) {
                              emails.push(user.username);
                            }

                            return emails;
                          })
                          .includes(input)
                      }
                      className="w-full"
                      placeholder="Add one or more users..."
                      isMulti
                      name="members"
                      options={filteredOrgUsers}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  ) : (
                    <FilterableSelect
                      className="w-full"
                      placeholder="Add one or more users..."
                      isMulti
                      name="members"
                      options={filteredOrgUsers}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
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
      </ModalContent>
    </Modal>
  );
};
