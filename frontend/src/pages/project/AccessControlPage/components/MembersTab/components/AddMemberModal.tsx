import { useEffect, useMemo } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Alert,
  AlertDescription,
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalContent
} from "@app/components/v2";
import { CreatableSelect } from "@app/components/v2/CreatableSelect";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useProject
} from "@app/context";
import {
  useAddUserToWsNonE2EE,
  useGetOrgUsers,
  useGetProjectRoles,
  useGetWorkspaceUsers
} from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/projects/types";
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
  const { currentProject } = useProject();
  const navigate = useNavigate({ from: "" });
  const { permission } = useOrgPermission();
  const requesterEmail = useSearch({
    strict: false,
    select: (el) => el?.requesterEmail
  });

  const orgId = currentOrg?.id || "";
  const projectId = currentProject?.id || "";

  const { data: members } = useGetWorkspaceUsers(projectId);
  const { data: orgUsers } = useGetOrgUsers(orgId);

  const { data: roles } = useGetProjectRoles(currentProject?.id || "");

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<TAddMemberForm>({
    resolver: zodResolver(addMemberFormSchema),
    defaultValues: { orgMemberships: [], projectRoleSlugs: [] }
  });

  const { mutateAsync: addUserToProject } = useAddUserToWsNonE2EE();

  useEffect(() => {
    if (requesterEmail) {
      handlePopUpToggle("addMember", true);
    }
  }, [requesterEmail]);

  const onAddMembers = async ({ orgMemberships, projectRoleSlugs }: TAddMemberForm) => {
    if (!currentProject) return;
    if (!currentOrg?.id) return;

    const existingMembers = orgMemberships.filter((membership) => !membership.isNewInvitee);
    const newInvitees = orgMemberships
      .filter((membership) => membership.isNewInvitee)
      .map((membership) => membership.value);

    const selectedMembers = existingMembers.map((orgMembership) =>
      orgUsers?.find((orgUser) => orgUser.id === orgMembership.value)
    );

    if (!selectedMembers) return;

    if (currentProject.version === ProjectVersion.V1) {
      createNotification({
        type: "error",
        text: "Please upgrade your project to invite new members to the project."
      });
    } else {
      const inviteeEmails = selectedMembers
        .map((member) => {
          if (!member) return null;

          if (member.user.username) {
            return member.user.username;
          }

          if (member.user.email) {
            return member.user.email;
          }

          return null;
        })
        .filter(Boolean) as string[];

      if (inviteeEmails.length !== selectedMembers.length) {
        createNotification({
          text: "Failed to add users to project. One or more users were invalid.",
          type: "error"
        });
        return;
      }

      if (newInvitees.length || inviteeEmails.length) {
        await addUserToProject({
          usernames: [...inviteeEmails, ...newInvitees],
          orgId,
          projectId: currentProject.id,
          roleSlugs: projectRoleSlugs.map((role) => role.slug)
        });
      }
    }
    createNotification({
      text: "Successfully added user to the project",
      type: "success"
    });
    handlePopUpToggle("addMember", false);
    if (requesterEmail) {
      navigate({
        search: (prev) => ({ ...prev, requesterEmail: "" })
      });
    }
    reset();
  };

  const { append } = useFieldArray<TAddMemberForm>({ control, name: "orgMemberships" });
  const projectInviteList = useMemo(() => {
    const wsUserUsernames = new Map();
    members?.forEach((member) => {
      wsUserUsernames.set(member.user.username, true);
    });
    const list = (orgUsers || [])
      .filter(({ user: u }) => !wsUserUsernames.has(u.username))
      .map(({ id, inviteEmail, user: { firstName, lastName, email } }) => ({
        value: id,
        label:
          firstName && lastName
            ? `${firstName} ${lastName}`
            : firstName || lastName || email || inviteEmail
      }));
    const requesterStatus = { isProjectUser: wsUserUsernames.has(requesterEmail), userLabel: "" };
    if (!requesterStatus.isProjectUser) {
      const userDetails = orgUsers?.find((el) => el.user.username === requesterEmail);
      if (userDetails) {
        const { user } = userDetails;
        const label =
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.firstName || user.lastName || (user.email as string);
        requesterStatus.userLabel = label;
        setValue("orgMemberships", [
          {
            value: userDetails.id,
            label
          }
        ]);
      }
    }

    return { list, requesterStatus };
  }, [orgUsers, members]);

  const selectedOrgMemberships = watch("orgMemberships");
  const selectedRoleSlugs = watch("projectRoleSlugs");

  const canInviteNewMembers = permission.can(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.Member
  );

  return (
    <Modal
      isOpen={popUp?.addMember?.isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen && requesterEmail)
          navigate({
            search: (prev) => ({ ...prev, requesterEmail: "" })
          });
        handlePopUpToggle("addMember", isOpen);
      }}
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
                            {!projectInviteList.list.length && (
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
                      options={projectInviteList.list}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  ) : (
                    <FilterableSelect
                      className="w-full"
                      placeholder="Add one or more users..."
                      isMulti
                      name="members"
                      options={projectInviteList.list}
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
                    components={{ Option: RoleOption }}
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
            {requesterEmail && projectInviteList.requesterStatus.isProjectUser && (
              <Alert hideTitle variant="danger">
                <AlertDescription>Requested user is part of the project.</AlertDescription>
              </Alert>
            )}
            {requesterEmail && !projectInviteList.requesterStatus.isProjectUser && (
              <Alert hideTitle>
                <AlertDescription>
                  Assign a role to provide access to requesting user{" "}
                  <b>{projectInviteList.requesterStatus.userLabel}</b>.
                </AlertDescription>
              </Alert>
            )}
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
