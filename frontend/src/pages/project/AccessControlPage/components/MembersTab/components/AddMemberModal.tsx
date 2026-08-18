import { useEffect, useMemo } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  CreatableSelect,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useOrganization,
  useOrgPermission,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  useAddUserToWsNonE2EE,
  useGetOrgUsers,
  useGetProjectRoles,
  useGetWorkspaceUsers
} from "@app/hooks/api";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { filterByGrantConditions, getMemberAssignRoleConditions } from "@app/lib/fn/permission";
import { getRequesterStatus } from "@app/lib/fn/requesterStatus";
import { OrgAccessControlTabSections } from "@app/types/org";

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
  const { permission: orgPermission } = useOrgPermission();
  const { permission: projectPermission } = useProjectPermission();
  const requesterEmail = useSearch({
    strict: false,
    select: (el) => el?.requesterEmail
  });

  const orgId = currentOrg?.id || "";
  const projectId = currentProject?.id || "";
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  const productLabel = isCertManager ? "Certificate Manager" : "Project";

  const {
    data: members,
    isPending: isMembersLoading,
    isError: isMembersError,
    refetch: refetchMembers
  } = useGetWorkspaceUsers(projectId);
  const {
    data: orgUsers,
    isPending: isOrgUsersLoading,
    isError: isOrgUsersError,
    refetch: refetchOrgUsers
  } = useGetOrgUsers(orgId);

  const {
    data: roles,
    isPending: isRolesLoading,
    isError: isRolesError,
    refetch: refetchRoles
  } = useGetProjectRoles(currentProject?.id || "", currentProject?.type);

  const canAddMembers = projectPermission.can(
    ProjectPermissionMemberActions.Create,
    ProjectPermissionSub.Member
  );
  const canInviteNewMembers = orgPermission.can(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.Member
  );
  const isReferenceDataLoading = isMembersLoading || isOrgUsersLoading || isRolesLoading;
  const hasReferenceDataError = isMembersError || isOrgUsersError || isRolesError;

  const assignRoleConditions = useMemo(
    () => getMemberAssignRoleConditions(projectPermission),
    [projectPermission]
  );

  const filteredRoles = useMemo(
    () =>
      filterByGrantConditions(roles ?? [], {
        getKey: (role) => role.slug,
        allowed: assignRoleConditions?.roles,
        forbidden: assignRoleConditions?.forbiddenRoles
      }),
    [roles, assignRoleConditions]
  );

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
    if (!canAddMembers || hasReferenceDataError) return;
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
          projectType: currentProject.type,
          roleSlugs: projectRoleSlugs.map((role) => role.slug)
        });
      }
    }
    createNotification({
      text: `Successfully added user to ${isCertManager ? productLabel : "the project"}`,
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

    const requesterStatus = getRequesterStatus(requesterEmail, orgUsers, wsUserUsernames);
    if (!requesterStatus.isProjectUser && requesterStatus.userId) {
      setValue("orgMemberships", [
        { value: requesterStatus.userId, label: requesterStatus.userLabel }
      ]);
    }

    return { list, requesterStatus };
  }, [orgUsers, members]);

  const selectedOrgMemberships = watch("orgMemberships");
  const selectedRoleSlugs = watch("projectRoleSlugs");

  return (
    <Dialog
      open={popUp?.addMember?.isOpen}
      onOpenChange={(isOpen) => {
        if (!isOpen && requesterEmail)
          navigate({
            search: (prev) => ({ ...prev, requesterEmail: "" })
          });
        handlePopUpToggle("addMember", isOpen);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isCertManager
              ? "Add Members to Certificate Manager"
              : (t("section.members.add-dialog.add-member-to-project") as string)}
          </DialogTitle>
          <DialogDescription>{t("section.members.add-dialog.user-will-email")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onAddMembers)} className="flex flex-col gap-4">
          {!canAddMembers && (
            <Alert variant="warning">
              <CircleAlertIcon />
              <AlertTitle>Permission required</AlertTitle>
              <AlertDescription>
                You don&apos;t have permission to add users to this {productLabel.toLowerCase()}.
              </AlertDescription>
            </Alert>
          )}
          {hasReferenceDataError && (
            <Alert variant="danger">
              <CircleAlertIcon />
              <AlertTitle>Could not load member options</AlertTitle>
              <AlertDescription>
                <span>Retry to load eligible users and roles.</span>
                <Button
                  size="xs"
                  variant="danger"
                  onClick={() =>
                    Promise.all([refetchMembers(), refetchOrgUsers(), refetchRoles()]).catch(
                      () => undefined
                    )
                  }
                >
                  <RefreshCwIcon />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <Controller
            control={control}
            name="orgMemberships"
            render={({ field }) => (
              <Field>
                <FieldLabel className="sr-only">
                  {`Invite users to ${productLabel.toLowerCase()}`}
                </FieldLabel>
                <FieldContent>
                  {canInviteNewMembers ? (
                    <CreatableSelect
                      /* eslint-disable-next-line react/no-unstable-nested-components */
                      noOptionsMessage={() => (
                        <>
                          {!projectInviteList.list.length && (
                            <p>All organization members are already assigned to this project.</p>
                          )}
                          <p>
                            Invite new users to your organization by typing out their email address.
                          </p>
                          {!projectInviteList.list.length && (
                            <Button asChild variant="outline" size="xs">
                              <Link
                                to="/organizations/$orgId/access-management"
                                params={{ orgId }}
                                search={{
                                  selectedTab: OrgAccessControlTabSections.Member,
                                  action: "invite-members"
                                }}
                              >
                                Invite users to your organization
                              </Link>
                            </Button>
                          )}
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
                      placeholder="Add one or more users..."
                      isMulti
                      name="members"
                      options={projectInviteList.list}
                      value={field.value}
                      onChange={field.onChange}
                      isError={!!errors.orgMemberships?.length}
                      isLoading={isReferenceDataLoading}
                      isDisabled={!canAddMembers || hasReferenceDataError}
                    />
                  ) : (
                    <FilterableSelect
                      placeholder="Add one or more users..."
                      isMulti
                      name="members"
                      options={projectInviteList.list}
                      value={field.value}
                      onChange={field.onChange}
                      isError={!!errors.orgMemberships?.length}
                      isLoading={isReferenceDataLoading}
                      isDisabled={!canAddMembers || hasReferenceDataError}
                    />
                  )}
                </FieldContent>
                <FieldError>{errors.orgMemberships?.[0]?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="projectRoleSlugs"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <Field>
                <FieldLabel className="sr-only">Select roles</FieldLabel>
                <FieldContent>
                  <FilterableSelect
                    options={filteredRoles}
                    components={{ Option: RoleOption }}
                    placeholder="Select roles..."
                    value={value}
                    onChange={onChange}
                    isMulti
                    getOptionValue={(option) => option.slug}
                    getOptionLabel={(option) => option.name}
                    isError={Boolean(error)}
                    isLoading={isReferenceDataLoading}
                    isDisabled={!canAddMembers || hasReferenceDataError}
                  />
                </FieldContent>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          {requesterEmail && projectInviteList.requesterStatus.isProjectUser && (
            <Alert variant="danger">
              <AlertDescription>Requested user is part of the project.</AlertDescription>
            </Alert>
          )}
          {requesterEmail && !projectInviteList.requesterStatus.isProjectUser && (
            <Alert>
              <AlertDescription>
                Assign a role to provide access to requesting user{" "}
                <b>{projectInviteList.requesterStatus.userLabel}</b>.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              type="button"
              onClick={() => handlePopUpToggle("addMember", false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting}
              isDisabled={
                isSubmitting ||
                !canAddMembers ||
                hasReferenceDataError ||
                isReferenceDataLoading ||
                selectedOrgMemberships.length === 0 ||
                selectedRoleSlugs.length === 0
              }
            >
              Add Members
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
