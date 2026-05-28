import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import { Button, FilterableSelect, FormControl } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { getProjectTitle } from "@app/helpers/project";
import { findOrgMembershipRole } from "@app/helpers/roles";
import {
  useAddUsersToOrg,
  useAddUserToWsNonE2EE,
  useGetOrgRoles,
  useGetProjectRoles,
  useGetUserProjects
} from "@app/hooks/api";
import { useGetAvailableOrgUsers } from "@app/hooks/api/organization/queries";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";

import { BUILT_IN_PROJECT_ROLES, CERT_MANAGER_ROLES, DEFAULT_PROJECT_ROLE } from "./constants";

const addMemberFormSchema = z.object({
  users: z
    .array(
      z.object({
        username: z.string().trim(),
        email: z.string().trim()
      })
    )
    .min(1),
  projects: z
    .array(
      z.object({
        name: z.string(),
        id: z.string(),
        slug: z.string(),
        type: z.string().optional(),
        version: z.nativeEnum(ProjectVersion)
      })
    )
    .default([]),
  projectRole: z
    .object({
      slug: z.string().min(1),
      name: z.string().min(1)
    })
    .default(DEFAULT_PROJECT_ROLE),
  organizationRole: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().optional()
  })
});

type TAddMemberForm = z.infer<typeof addMemberFormSchema>;

type Props = {
  onClose: () => void;
};

export const AddSubOrgMemberModal = ({ onClose }: Props) => {
  const { currentOrg } = useOrganization();

  const { data: organizationRoles } = useGetOrgRoles(currentOrg?.id ?? "");
  const { data: members = [], isPending: isMembersPending } = useGetAvailableOrgUsers();

  const { mutateAsync: addUsersMutateAsync } = useAddUsersToOrg();
  const { mutateAsync: addUserToProject } = useAddUserToWsNonE2EE();

  const { data: projects, isPending: isProjectsLoading } = useGetUserProjects({
    includeRoles: true
  });

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { isSubmitting }
  } = useForm<TAddMemberForm>({
    resolver: zodResolver(addMemberFormSchema)
  });

  const selectedProjects = watch("projects", []);
  const singleSelectedProjectId =
    selectedProjects.length === 1 ? selectedProjects[0].id : undefined;
  const hasCertManagerSelection = selectedProjects.some(
    (p) => p.type === ProjectType.CertificateManager
  );

  const { data: fetchedProjectRoles, isPending: isProjectRolesLoading } = useGetProjectRoles(
    singleSelectedProjectId ?? ""
  );

  // eslint-disable-next-line no-nested-ternary
  const projectRoles = hasCertManagerSelection
    ? CERT_MANAGER_ROLES
    : fetchedProjectRoles?.length
      ? fetchedProjectRoles
      : BUILT_IN_PROJECT_ROLES;

  useEffect(() => {
    setValue("projectRole", DEFAULT_PROJECT_ROLE);
  }, [singleSelectedProjectId, hasCertManagerSelection, setValue]);

  useEffect(() => {
    if (organizationRoles) {
      reset({
        organizationRole: findOrgMembershipRole(
          organizationRoles,
          currentOrg.defaultMembershipRole
        ),
        projectRole: DEFAULT_PROJECT_ROLE
      });
    }
  }, [organizationRoles]);

  const onAddMembers = async ({
    users,
    organizationRole,
    projects: selectedProjectsToInvite,
    projectRole
  }: TAddMemberForm) => {
    if (!currentOrg?.id) return;

    if (selectedProjectsToInvite?.length) {
      // eslint-disable-next-line no-restricted-syntax
      for (const project of selectedProjectsToInvite) {
        if (project.version !== ProjectVersion.V3) {
          createNotification({
            type: "error",
            text: `Cannot add users to project "${project.name}" because it's incompatible. Please upgrade the project.`
          });
          return;
        }
      }
    }

    const usernames = users.map((el) => el.username);
    await addUsersMutateAsync({
      organizationId: currentOrg?.id,
      inviteeEmails: usernames,
      organizationRoleSlug: organizationRole.slug
    });

    await Promise.allSettled(
      selectedProjectsToInvite.map((el) =>
        addUserToProject({
          orgId: currentOrg.id,
          projectId: el.id,
          projectType: el.type,
          roleSlugs: [projectRole.slug],
          usernames
        })
      )
    );
    onClose();
  };

  return (
    <form onSubmit={handleSubmit(onAddMembers)}>
      <Controller
        control={control}
        name="users"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Emails" isError={Boolean(error)} errorText={error?.message}>
            <FilterableSelect
              className="w-full"
              placeholder="Add one or more users..."
              isMulti
              name="members"
              isLoading={isMembersPending}
              options={members}
              value={field.value}
              onChange={field.onChange}
              getOptionValue={(option) => option.username}
              getOptionLabel={(option) => option.username}
              /* eslint-disable-next-line react/no-unstable-nested-components */
              noOptionsMessage={() => (
                <p>All root organization users are already assigned to this project</p>
              )}
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="organizationRole"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipText="Select which organization role you want to assign to the user."
            label="Assign organization role"
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <FilterableSelect
              placeholder="Select role..."
              options={organizationRoles}
              getOptionValue={(option) => option.slug}
              getOptionLabel={(option) => option.name}
              value={value}
              onChange={onChange}
              components={{ Option: RoleOption }}
            />
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="projects"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            label="Assign users to projects"
            isOptional
            isError={Boolean(error?.message)}
            errorText={error?.message}
          >
            <FilterableSelect
              isMulti
              value={value}
              onChange={onChange}
              isLoading={isProjectsLoading}
              getOptionLabel={(project) => project.name}
              getOptionValue={(project) => project.id}
              options={projects}
              groupBy="type"
              getGroupHeaderLabel={getProjectTitle}
              placeholder="Select projects..."
            />
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="projectRole"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipText={
              <>
                Select which role to assign to the users in the selected projects.
                <br />
                <br />
                When multiple projects are selected, only built-in roles are available for
                selection.
                <br />
                <br />
                You can assign users to additional projects after they&apos;ve been invited.
              </>
            }
            label="Project role"
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <FilterableSelect
              isDisabled={selectedProjects.length === 0}
              isLoading={Boolean(singleSelectedProjectId) && isProjectRolesLoading}
              value={value}
              onChange={onChange}
              options={projectRoles ?? []}
              getOptionValue={(option) => option.slug}
              getOptionLabel={(option) => option.name}
              placeholder="Select role..."
              components={{ Option: RoleOption }}
            />
          </FormControl>
        )}
      />

      <div className="mt-8 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          Add Member
        </Button>
        <Button colorSchema="secondary" variant="plain" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
