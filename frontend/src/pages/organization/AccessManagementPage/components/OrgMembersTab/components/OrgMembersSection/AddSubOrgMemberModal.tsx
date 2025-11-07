import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { RoleOption } from "@app/components/roles";
import { Button, FilterableSelect, FormControl, Select, SelectItem } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { findOrgMembershipRole } from "@app/helpers/roles";
import {
  useAddUsersToOrg,
  useAddUserToWsNonE2EE,
  useGetOrgRoles,
  useGetUserProjects
} from "@app/hooks/api";
import { useGetAvailableOrgUsers } from "@app/hooks/api/organization/queries";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const DEFAULT_ORG_AND_PROJECT_MEMBER_ROLE_SLUG = "member";

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
        version: z.nativeEnum(ProjectVersion)
      })
    )
    .default([]),
  projectRoleSlug: z.string().min(1).default(DEFAULT_ORG_AND_PROJECT_MEMBER_ROLE_SLUG),
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
    formState: { isSubmitting }
  } = useForm<TAddMemberForm>({
    resolver: zodResolver(addMemberFormSchema)
  });

  // set initial form role based off org default role
  useEffect(() => {
    if (organizationRoles) {
      reset({
        organizationRole: findOrgMembershipRole(organizationRoles, currentOrg.defaultMembershipRole)
      });
    }
  }, [organizationRoles]);

  const onAddMembers = async ({
    users,
    organizationRole,
    projects: selectedProjects,
    projectRoleSlug
  }: TAddMemberForm) => {
    if (!currentOrg?.id) return;

    if (selectedProjects?.length) {
      // eslint-disable-next-line no-restricted-syntax
      for (const project of selectedProjects) {
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
      selectedProjects.map((el) =>
        addUserToProject({
          orgId: currentOrg.id,
          projectId: el.id,
          roleSlugs: [projectRoleSlug],
          usernames
        })
      )
    );
    onClose();
  };

  const getGroupHeaderLabel = (type: ProjectType) => {
    switch (type) {
      case ProjectType.SecretManager:
        return "Secrets";
      case ProjectType.CertificateManager:
        return "PKI";
      case ProjectType.KMS:
        return "KMS";
      case ProjectType.SSH:
        return "SSH";
      default:
        return "Other";
    }
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

      <div className="flex items-start justify-between gap-2">
        <div className="w-full">
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
                  getGroupHeaderLabel={getGroupHeaderLabel}
                  placeholder="Select projects..."
                />
              </FormControl>
            )}
          />
        </div>
        <div className="mt-[0.15rem] flex min-w-fit justify-end">
          <Controller
            control={control}
            name="projectRoleSlug"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                tooltipText="Select which role to assign to the users in the selected projects."
                label="Role"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <div>
                  <Select
                    isDisabled={watch("projects", []).length === 0}
                    defaultValue={DEFAULT_ORG_AND_PROJECT_MEMBER_ROLE_SLUG}
                    {...field}
                    onValueChange={(val) => field.onChange(val)}
                  >
                    {Object.entries(ProjectMembershipRole).map(
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      ([_, slug]) =>
                        slug !== "custom" && (
                          <SelectItem key={slug} value={slug}>
                            <span className="capitalize">{slug.replace("-", " ")}</span>
                          </SelectItem>
                        )
                    )}
                  </Select>
                </div>
              </FormControl>
            )}
          />
        </div>
      </div>

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
