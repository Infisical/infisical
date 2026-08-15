import { useEffect } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
    <Dialog
      open={popUp.addMemberToSubOrg.isOpen}
      onOpenChange={(isOpen) =>
        isOpen ? handlePopUpToggle("addMemberToSubOrg", true) : handleClose()
      }
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add member from your organization</DialogTitle>
          <DialogDescription>
            Add existing users from your root organization to this sub-organization.
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onAddMembers)} className="flex flex-col gap-4">
            <Controller
              control={control}
              name="users"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="add-sub-org-member-users">Emails</FieldLabel>
                  <FilterableSelect
                    inputId="add-sub-org-member-users"
                    placeholder="Add one or more users..."
                    isMulti
                    isLoading={isMembersPending}
                    options={members}
                    value={field.value}
                    onChange={field.onChange}
                    getOptionValue={(option) => option.username}
                    getOptionLabel={(option) => option.username}
                    isError={Boolean(error)}
                    noOptionsMessage={() =>
                      "All root organization users are already in this sub-organization"
                    }
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            <Controller
              control={control}
              name="organizationRole"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="add-sub-org-member-org-role">
                    Assign organization role
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Info className="size-3 text-muted" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        Select which organization role you want to assign to the user.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Combobox
                    id="add-sub-org-member-org-role"
                    options={organizationRoles ?? []}
                    value={value}
                    onValueChange={onChange}
                    getOptionValue={(option) => option.slug}
                    getOptionLabel={(option) => option.name}
                    getOptionKeywords={(option) => (option.description ? [option.description] : [])}
                    placeholder="Select role..."
                    searchPlaceholder="Search roles..."
                    searchAriaLabel="Search organization roles"
                    emptyMessage="No organization roles found."
                    isError={Boolean(error)}
                    isLoading={isOrganizationRolesPending}
                    modal
                    renderOption={(option) => (
                      <div className="min-w-0">
                        <p className="truncate">{option.name}</p>
                        {option.description ? (
                          <p className="text-xs leading-4 break-words whitespace-normal text-muted">
                            {option.description}
                          </p>
                        ) : (
                          <p className="text-xs leading-4 text-muted/65">No Description</p>
                        )}
                      </div>
                    )}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            <ProjectAssignmentFields />

            <DialogFooter>
              <Button variant="ghost" type="button" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="sub-org"
                type="submit"
                isPending={isSubmitting}
                isDisabled={isSubmitting}
              >
                Add Member
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
};
