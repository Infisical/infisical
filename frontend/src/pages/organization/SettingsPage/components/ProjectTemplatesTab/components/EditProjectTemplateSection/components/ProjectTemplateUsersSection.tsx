import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faSave, faTrash, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  EmptyState,
  FilterableSelect,
  FormControl,
  IconButton,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  TProjectTemplate,
  TProjectTemplateUser,
  useUpdateProjectTemplate
} from "@app/hooks/api/projectTemplates";
import { useGetOrgUsers } from "@app/hooks/api/users";

type Props = {
  projectTemplate: TProjectTemplate;
  isInfisicalTemplate: boolean;
};

const formSchema = z.object({
  users: z
    .object({
      username: z.string().min(1),
      roles: z.array(z.string()).min(1, "At least one role is required")
    })
    .array()
});

type TFormSchema = z.infer<typeof formSchema>;

const addUserFormSchema = z.object({
  selectedUsers: z
    .array(
      z.object({
        label: z.string(),
        value: z.string()
      })
    )
    .min(1, "Select at least one user"),
  roles: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string()
      })
    )
    .min(1, "Select at least one role")
});

type TAddUserForm = z.infer<typeof addUserFormSchema>;

export const ProjectTemplateUsersSection = ({ projectTemplate, isInfisicalTemplate }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);

  const { data: orgUsers } = useGetOrgUsers(orgId);

  const {
    control,
    handleSubmit,
    formState: { isDirty, errors },
    reset,
    watch
  } = useForm<TFormSchema>({
    defaultValues: {
      users: (projectTemplate.users || []) as TProjectTemplateUser[]
    },
    resolver: zodResolver(formSchema)
  });

  const { fields: users, remove, append } = useFieldArray({ control, name: "users" });

  const updateProjectTemplate = useUpdateProjectTemplate();

  const onFormSubmit = async (form: TFormSchema) => {
    await updateProjectTemplate.mutateAsync({
      users: form.users.length > 0 ? form.users : null,
      templateId: projectTemplate.id
    });

    reset({ users: form.users });

    createNotification({
      text: "Project template users updated successfully",
      type: "success"
    });
  };

  const handleDiscard = () => {
    reset({ users: (projectTemplate.users || []) as TProjectTemplateUser[] });
  };

  // Available roles from template (predefined + custom)
  const availableRoles = useMemo(() => {
    const predefinedRoles = [
      { slug: "admin", name: "Admin" },
      { slug: "member", name: "Member" },
      { slug: "viewer", name: "Viewer" },
      { slug: "no-access", name: "No Access" }
    ];

    const customRoles = projectTemplate.roles
      .filter((role) => !["admin", "member", "viewer", "no-access", "custom"].includes(role.slug))
      .map((role) => ({ slug: role.slug, name: role.name }));

    return [...predefinedRoles, ...customRoles];
  }, [projectTemplate.roles]);

  // Org users for dropdown, excluding already added users
  const currentUsers = watch("users");
  const availableOrgUsers = useMemo(() => {
    const addedUsernames = new Set(currentUsers.map((u) => u.username.toLowerCase()));
    return (orgUsers || [])
      .filter((orgUser) => {
        const username = orgUser.user.username?.toLowerCase();
        return username && !addedUsernames.has(username);
      })
      .map((orgUser) => ({
        value: orgUser.user.username,
        label:
          orgUser.user.firstName && orgUser.user.lastName
            ? `${orgUser.user.firstName} ${orgUser.user.lastName} (${orgUser.user.username})`
            : orgUser.user.email || orgUser.user.username
      }));
  }, [orgUsers, currentUsers]);

  const getRoleNames = (roleSlugs: string[]) => {
    return roleSlugs
      .map((slug) => {
        const role = availableRoles.find((r) => r.slug === slug);
        return role?.name || slug;
      })
      .join(", ");
  };

  // Add user modal form
  const {
    control: addUserControl,
    handleSubmit: handleAddUserSubmit,
    reset: resetAddUserForm,
    watch: watchAddUser,
    formState: { errors: addUserErrors }
  } = useForm<TAddUserForm>({
    resolver: zodResolver(addUserFormSchema),
    defaultValues: {
      selectedUsers: [],
      roles: []
    }
  });

  const selectedUsersInModal = watchAddUser("selectedUsers");
  const selectedRolesInModal = watchAddUser("roles");

  const handleAddUsers = (form: TAddUserForm) => {
    form.selectedUsers.forEach((user) => {
      append({
        username: user.value,
        roles: form.roles.map((r) => r.slug)
      });
    });
    resetAddUserForm();
    setIsAddUserModalOpen(false);
  };

  const handleCloseAddUserModal = () => {
    resetAddUserForm();
    setIsAddUserModalOpen(false);
  };

  return (
    <>
      <form
        onSubmit={handleSubmit(onFormSubmit)}
        className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      >
        <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
          <div>
            <h2 className="text-lg font-medium">Default Project Members</h2>
            <p className="text-sm text-mineshaft-400">
              {isInfisicalTemplate
                ? "Users that will be automatically added to projects created from this template"
                : "Add users who will be automatically added to projects created from this template"}
            </p>
          </div>
          {!isInfisicalTemplate && (
            <OrgPermissionCan
              I={OrgPermissionActions.Edit}
              a={OrgPermissionSubjects.ProjectTemplates}
            >
              {(isAllowed) => (
                <div className="flex gap-3">
                  {isAllowed && isDirty && (
                    <>
                      <Button
                        onClick={handleDiscard}
                        colorSchema="secondary"
                        variant="plain"
                        type="button"
                      >
                        Discard
                      </Button>
                      <Button
                        type="submit"
                        colorSchema="primary"
                        variant="solid"
                        leftIcon={<FontAwesomeIcon icon={faSave} />}
                      >
                        Save
                      </Button>
                    </>
                  )}
                  <Button
                    onClick={() => setIsAddUserModalOpen(true)}
                    colorSchema="primary"
                    variant="outline_bg"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    isDisabled={!isAllowed || availableOrgUsers.length === 0}
                    type="button"
                  >
                    Add User
                  </Button>
                </div>
              )}
            </OrgPermissionCan>
          )}
        </div>
        {errors.users && <span className="my-4 text-sm text-red">{errors.users.message}</span>}
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Username</Th>
                <Th>Roles</Th>
                {!isInfisicalTemplate && <Th className="w-16" />}
              </Tr>
            </THead>
            <TBody>
              {users.length > 0 ? (
                users.map(({ id }, pos) => (
                  <Tr key={id}>
                    <Td>
                      <Controller
                        control={control}
                        name={`users.${pos}.username`}
                        render={({ field }) => <span className="text-sm">{field.value}</span>}
                      />
                    </Td>
                    <Td>
                      {isInfisicalTemplate ? (
                        <Controller
                          control={control}
                          name={`users.${pos}.roles`}
                          render={({ field }) => (
                            <span className="text-sm">{getRoleNames(field.value)}</span>
                          )}
                        />
                      ) : (
                        <OrgPermissionCan
                          I={OrgPermissionActions.Edit}
                          a={OrgPermissionSubjects.ProjectTemplates}
                        >
                          {(isAllowed) => (
                            <Controller
                              control={control}
                              name={`users.${pos}.roles`}
                              render={({ field, fieldState: { error } }) => (
                                <FormControl
                                  isError={Boolean(error?.message)}
                                  errorText={error?.message}
                                  className="mb-0"
                                >
                                  <FilterableSelect
                                    isMulti
                                    isDisabled={!isAllowed}
                                    options={availableRoles}
                                    value={availableRoles.filter((role) =>
                                      field.value.includes(role.slug)
                                    )}
                                    onChange={(selected) => {
                                      field.onChange(
                                        (selected as { slug: string; name: string }[]).map(
                                          (s) => s.slug
                                        )
                                      );
                                    }}
                                    getOptionValue={(option) => option.slug}
                                    getOptionLabel={(option) => option.name}
                                    placeholder="Select roles..."
                                  />
                                </FormControl>
                              )}
                            />
                          )}
                        </OrgPermissionCan>
                      )}
                    </Td>
                    {!isInfisicalTemplate && (
                      <Td>
                        <OrgPermissionCan
                          I={OrgPermissionActions.Edit}
                          a={OrgPermissionSubjects.ProjectTemplates}
                        >
                          {(isAllowed) => (
                            <IconButton
                              onClick={() => remove(pos)}
                              colorSchema="danger"
                              variant="plain"
                              ariaLabel="Remove user"
                              isDisabled={!isAllowed}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </IconButton>
                          )}
                        </OrgPermissionCan>
                      </Td>
                    )}
                  </Tr>
                ))
              ) : (
                <Tr>
                  <Td colSpan={isInfisicalTemplate ? 2 : 3}>
                    <EmptyState title="No users assigned to this template" icon={faUsers} />
                  </Td>
                </Tr>
              )}
            </TBody>
          </Table>
        </TableContainer>
      </form>

      {/* Add User Modal */}
      <Modal isOpen={isAddUserModalOpen} onOpenChange={setIsAddUserModalOpen}>
        <ModalContent
          title="Add Users to Template"
          subTitle="Select users and roles to add to this project template"
          bodyClassName="overflow-visible"
        >
          <form onSubmit={handleAddUserSubmit(handleAddUsers)}>
            <div className="flex flex-col gap-4">
              <Controller
                control={addUserControl}
                name="selectedUsers"
                render={({ field }) => (
                  <FormControl
                    label="Select users"
                    isError={Boolean(addUserErrors.selectedUsers)}
                    errorText={addUserErrors.selectedUsers?.message}
                  >
                    <FilterableSelect
                      isMulti
                      options={availableOrgUsers}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Select one or more users..."
                      noOptionsMessage={() =>
                        availableOrgUsers.length === 0
                          ? "All organization members have been added"
                          : "No matching users found"
                      }
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={addUserControl}
                name="roles"
                render={({ field }) => (
                  <FormControl
                    label="Select roles"
                    isError={Boolean(addUserErrors.roles)}
                    errorText={addUserErrors.roles?.message}
                    tooltipText="Select the roles that will be assigned to the selected users"
                  >
                    <FilterableSelect
                      isMulti
                      options={availableRoles}
                      value={field.value}
                      onChange={field.onChange}
                      getOptionValue={(option) => option.slug}
                      getOptionLabel={(option) => option.name}
                      placeholder="Select roles..."
                    />
                  </FormControl>
                )}
              />
            </div>
            <div className="mt-8 flex items-center gap-4">
              <Button
                type="submit"
                colorSchema="primary"
                isDisabled={selectedUsersInModal.length === 0 || selectedRolesInModal.length === 0}
              >
                Add Users
              </Button>
              <Button
                type="button"
                colorSchema="secondary"
                variant="plain"
                onClick={handleCloseAddUserModal}
              >
                Cancel
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </>
  );
};
