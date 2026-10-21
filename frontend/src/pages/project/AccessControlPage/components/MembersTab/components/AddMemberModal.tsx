import { useEffect, useMemo } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
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
  OrgPermissionMemberActions,
  OrgPermissionSubjects,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useOrganization,
  useOrgPermission,
  useProject,
  useProjectPermission
} from "@app/context";
import { isValidEmail } from "@app/helpers/email";
import { getProjectLabel, hidesProjects } from "@app/helpers/project";
import { useScopeVariant } from "@app/hooks";
import {
  useAddUserToWsNonE2EE,
  useGetAvailableProjectUsers,
  useGetProjectRoles,
  useGetWorkspaceUsers
} from "@app/hooks/api";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import { TAvailableProjectUser } from "@app/hooks/api/users/types";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { filterByGrantConditions, getMemberAssignRoleConditions } from "@app/lib/fn/permission";

const addMemberFormSchema = z.object({
  orgMemberships: z
    .array(
      z.object({
        label: z.string().trim(),
        value: z.string().trim()
      })
    )
    .min(1),
  projectRoleSlugs: z.array(z.object({ slug: z.string().trim(), name: z.string().trim() })).min(1)
});

type TAddMemberForm = z.infer<typeof addMemberFormSchema>;

const getUserLabel = ({ firstName, lastName, email, username }: TAvailableProjectUser) =>
  firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || email || username;

type Props = {
  popUp: UsePopUpState<["addMember"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addMember"]>, state?: boolean) => void;
};

export const AddMemberModal = ({ popUp, handlePopUpToggle }: Props) => {
  const scopeVariant = useScopeVariant();
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
  const productLabel = getProjectLabel(currentProject?.type);
  const projectsHidden = hidesProjects(currentProject?.type);

  const {
    data: members,
    isPending: isMembersLoading,
    isError: isMembersError,
    refetch: refetchMembers
  } = useGetWorkspaceUsers(projectId);
  const {
    data: availableUsers,
    isPending: isAvailableUsersLoading,
    isError: isAvailableUsersError,
    refetch: refetchAvailableUsers
  } = useGetAvailableProjectUsers(projectId, currentProject?.type);

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
    OrgPermissionMemberActions.Create,
    OrgPermissionSubjects.Member
  );
  const isReferenceDataLoading = isMembersLoading || isAvailableUsersLoading || isRolesLoading;
  const hasReferenceDataError = isMembersError || isAvailableUsersError || isRolesError;

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

    if (currentProject.version === ProjectVersion.V1) {
      createNotification({
        type: "error",
        text: "Please upgrade your project to invite new members to the project."
      });
    } else {
      await addUserToProject({
        usernames: orgMemberships.map((membership) => membership.value),
        orgId,
        projectId: currentProject.id,
        projectType: currentProject.type,
        roleSlugs: projectRoleSlugs.map((role) => role.slug)
      });
    }
    createNotification({
      text: `Successfully added user to ${projectsHidden ? productLabel : "the project"}`,
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
    const wsUserUsernames = new Set(members?.map((member) => member.user.username));
    const list = (availableUsers || []).map((user) => ({
      value: user.username,
      label: getUserLabel(user)
    }));

    const requester = requesterEmail
      ? availableUsers?.find((user) => user.username === requesterEmail)
      : undefined;
    const requesterStatus = {
      isProjectUser: Boolean(requesterEmail) && wsUserUsernames.has(requesterEmail as string),
      userLabel: requester ? getUserLabel(requester) : "",
      hasRequester: Boolean(requester)
    };
    if (!requesterStatus.isProjectUser && requester) {
      setValue("orgMemberships", [{ value: requester.username, label: requesterStatus.userLabel }]);
    }

    const knownUsernames = new Set([
      ...wsUserUsernames,
      ...(availableUsers || []).flatMap((user) => [user.username, user.email].filter(Boolean))
    ]);

    return { list, requesterStatus, knownUsernames };
  }, [availableUsers, members]);

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
            {projectsHidden
              ? `Add Members to ${productLabel}`
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
                    Promise.all([refetchMembers(), refetchAvailableUsers(), refetchRoles()]).catch(
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
                            <p>
                              All organization members are already assigned to{" "}
                              {projectsHidden ? productLabel : "this project"}.
                            </p>
                          )}
                          <p>
                            Invite new users to your organization by typing out their email address.
                          </p>
                        </>
                      )}
                      onCreateOption={(inputValue) =>
                        append({ label: inputValue, value: inputValue })
                      }
                      formatCreateLabel={(inputValue) => `Invite "${inputValue}"`}
                      isValidNewOption={(input) =>
                        Boolean(input) &&
                        isValidEmail(input) &&
                        !projectInviteList.knownUsernames.has(input)
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
              <AlertDescription>
                Requested user is part of {projectsHidden ? productLabel : "the project"}.
              </AlertDescription>
            </Alert>
          )}
          {requesterEmail &&
            !projectInviteList.requesterStatus.isProjectUser &&
            projectInviteList.requesterStatus.hasRequester && (
              <Alert>
                <AlertDescription>
                  <p>
                    Assign a role to provide access to requesting user{" "}
                    <b>{projectInviteList.requesterStatus.userLabel}</b>.
                  </p>
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
              variant={scopeVariant}
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
