import { useEffect } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Combobox, Field, FieldError, FieldLabel } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { findOrgMembershipRole } from "@app/helpers/roles";
import {
  useAddUsersToOrg,
  useAddUserToWsNonE2EE,
  useGetOrgRoles,
  useGetUserProjects
} from "@app/hooks/api";
import { useGetAvailableOrgUsers } from "@app/hooks/api/organization/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { MemberFormSheet, MemberFormSheetForm } from "./MemberFormSheet";
import { OrganizationRoleField } from "./OrganizationRoleField";
import {
  ProjectAssignmentFields,
  projectAssignmentSchema,
  resolveTargetProjects
} from "./ProjectAssignmentFields";
import { DEFAULT_PROJECT_ROLE } from "./ProjectRoleSelect";

const addMemberFormSchema = projectAssignmentSchema.extend({
  users: z
    .array(
      z.object({
        username: z.string().trim(),
        email: z.string().trim()
      })
    )
    .min(1, "Select at least one user"),
  organizationRole: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().optional()
  })
});

type TAddMemberForm = z.infer<typeof addMemberFormSchema>;

type Props = {
  popUp: UsePopUpState<["addMemberToSubOrg"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["addMemberToSubOrg"]>,
    state?: boolean
  ) => void;
};

export const AddSubOrgMemberModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();

  const { data: organizationRoles, isPending: isOrganizationRolesPending } = useGetOrgRoles(
    currentOrg?.id ?? ""
  );
  const { data: members = [], isPending: isMembersPending } = useGetAvailableOrgUsers();

  const { mutateAsync: addUsersMutateAsync } = useAddUsersToOrg();
  const { mutateAsync: addUserToProject } = useAddUserToWsNonE2EE();

  const { data: rawProjects } = useGetUserProjects({
    includeRoles: true
  });

  const methods = useForm<TAddMemberForm>({
    resolver: zodResolver(addMemberFormSchema),
    defaultValues: {
      users: [],
      projects: [],
      projectRole: DEFAULT_PROJECT_ROLE
    }
  });
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = methods;

  const resetForm = () => {
    reset({
      users: [],
      product: undefined,
      projects: [],
      projectRole: DEFAULT_PROJECT_ROLE,
      organizationRole: organizationRoles
        ? findOrgMembershipRole(organizationRoles, currentOrg.defaultMembershipRole)
        : undefined
    });
  };

  // set initial form role based off org default role
  useEffect(() => {
    if (organizationRoles) {
      resetForm();
    }
  }, [organizationRoles]);

  const handleClose = () => {
    handlePopUpToggle("addMemberToSubOrg", false);
    resetForm();
  };

  const onAddMembers = async ({
    users,
    organizationRole,
    product,
    projects: projectsToAssign,
    projectRole
  }: TAddMemberForm) => {
    if (!currentOrg?.id) return;

    const targetProjects = resolveTargetProjects(product, projectsToAssign, rawProjects);
    if (!targetProjects) return;

    const usernames = users.map((el) => el.username);
    await addUsersMutateAsync({
      organizationId: currentOrg?.id,
      inviteeEmails: usernames,
      organizationRoleSlug: organizationRole.slug
    });

    await Promise.allSettled(
      targetProjects.map((el) =>
        addUserToProject({
          orgId: currentOrg.id,
          projectId: el.id,
          projectType: el.type,
          roleSlugs: [projectRole.slug],
          usernames
        })
      )
    );
    handleClose();
  };

  return (
    <MemberFormSheet
      open={popUp.addMemberToSubOrg.isOpen}
      onOpenChange={(isOpen) =>
        isOpen ? handlePopUpToggle("addMemberToSubOrg", true) : handleClose()
      }
      title="Add member from your organization"
      description="Add existing users from your root organization to this sub-organization."
    >
      <FormProvider {...methods}>
        <MemberFormSheetForm
          onSubmit={handleSubmit(onAddMembers)}
          onCancel={handleClose}
          submitVariant="sub-org"
          isSubmitting={isSubmitting}
        >
          <Controller
            control={control}
            name="users"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="add-sub-org-member-users">Emails</FieldLabel>
                <Combobox
                  id="add-sub-org-member-users"
                  multiple
                  placeholder="Add one or more users..."
                  searchPlaceholder="Search users..."
                  searchAriaLabel="Search organization users"
                  clearAriaLabel="Clear all users"
                  isLoading={isMembersPending}
                  options={members}
                  value={field.value}
                  onValueChange={field.onChange}
                  getOptionValue={(option) => option.username}
                  getOptionLabel={(option) => option.username}
                  isError={Boolean(error)}
                  emptyMessage="All root organization users are already in this sub-organization"
                  modal
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="organizationRole"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <OrganizationRoleField
                id="add-sub-org-member-org-role"
                options={organizationRoles ?? []}
                value={value}
                onValueChange={onChange}
                isError={Boolean(error)}
                errorMessage={error?.message}
                isLoading={isOrganizationRolesPending}
              />
            )}
          />

          <ProjectAssignmentFields />
        </MemberFormSheetForm>
      </FormProvider>
    </MemberFormSheet>
  );
};
