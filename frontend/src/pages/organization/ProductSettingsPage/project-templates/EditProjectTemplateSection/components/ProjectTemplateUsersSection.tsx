import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Save, Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import {
  TProjectTemplate,
  TProjectTemplateUser,
  useUpdateProjectTemplate
} from "@app/hooks/api/projectTemplates";
import { useGetOrgUsers } from "@app/hooks/api/users";

type Props = {
  projectTemplate: TProjectTemplate;
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

export const ProjectTemplateUsersSection = ({ projectTemplate }: Props) => {
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
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Project Members</CardTitle>
            <CardDescription>
              Add users who will be automatically added to projects created from this template.
            </CardDescription>
            <CardAction>
              <OrgPermissionCan
                I={OrgPermissionActions.Edit}
                a={OrgPermissionSubjects.ProjectTemplates}
              >
                {(isAllowed) => (
                  <div className="flex gap-3">
                    {isAllowed && isDirty && (
                      <>
                        <Button onClick={handleDiscard} variant="ghost" type="button">
                          Discard
                        </Button>
                        <Button type="submit" variant="outline">
                          <Save className="size-4" />
                          Save Changes
                        </Button>
                      </>
                    )}
                    <Button
                      onClick={() => setIsAddUserModalOpen(true)}
                      variant="project"
                      isDisabled={!isAllowed || availableOrgUsers.length === 0}
                      type="button"
                    >
                      <Plus className="size-4" />
                      Add User
                    </Button>
                  </div>
                )}
              </OrgPermissionCan>
            </CardAction>
          </CardHeader>
          <CardContent>
            {errors.users && (
              <span className="my-4 text-sm text-danger">{errors.users.message}</span>
            )}
            {users.length > 0 ? (
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(({ id }, pos) => (
                    <TableRow key={id}>
                      <TableCell className="py-2">
                        <Controller
                          control={control}
                          name={`users.${pos}.username`}
                          render={({ field }) => (
                            <p className="truncate">
                              <span className="text-sm font-medium text-mineshaft-100">
                                {field.value}
                              </span>
                            </p>
                          )}
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        <OrgPermissionCan
                          I={OrgPermissionActions.Edit}
                          a={OrgPermissionSubjects.ProjectTemplates}
                        >
                          {(isAllowed) => (
                            <Controller
                              control={control}
                              name={`users.${pos}.roles`}
                              render={({ field, fieldState: { error } }) => {
                                const availableRoleSlugs = new Set(
                                  availableRoles.map((r) => r.slug)
                                );
                                const orphanedRoles = field.value
                                  .filter((slug) => !availableRoleSlugs.has(slug))
                                  .map((slug) => ({ slug, name: slug }));
                                const allOptions = [...availableRoles, ...orphanedRoles];

                                const selectedValues = allOptions.filter((role) =>
                                  field.value.includes(role.slug)
                                );

                                return (
                                  <Field className="mb-0 max-w-[786px]">
                                    <FilterableSelect
                                      isMulti
                                      isDisabled={!isAllowed}
                                      options={allOptions}
                                      value={selectedValues}
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
                                      menuPosition="fixed"
                                    />
                                    {error?.message && <FieldError>{error.message}</FieldError>}
                                  </Field>
                                );
                              }}
                            />
                          )}
                        </OrgPermissionCan>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex justify-end">
                          <OrgPermissionCan
                            I={OrgPermissionActions.Edit}
                            a={OrgPermissionSubjects.ProjectTemplates}
                          >
                            {(isAllowed) => (
                              <IconButton
                                onClick={() => remove(pos)}
                                variant="ghost-muted"
                                size="xs"
                                aria-label="Remove user"
                                isDisabled={!isAllowed}
                              >
                                <Trash2 className="size-4" />
                              </IconButton>
                            )}
                          </OrgPermissionCan>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyTitle>No users assigned to this template</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </form>

      <Dialog open={isAddUserModalOpen} onOpenChange={setIsAddUserModalOpen}>
        <DialogContent className="max-w-xl overflow-visible">
          <DialogHeader>
            <DialogTitle>Add Users to Template</DialogTitle>
            <DialogDescription>
              Select users and roles to add to this project template
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddUserSubmit(handleAddUsers)}>
            <div className="flex flex-col gap-4">
              <Controller
                control={addUserControl}
                name="selectedUsers"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Select users</FieldLabel>
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
                    {addUserErrors.selectedUsers?.message && (
                      <FieldError>{addUserErrors.selectedUsers.message}</FieldError>
                    )}
                  </Field>
                )}
              />
              <Controller
                control={addUserControl}
                name="roles"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Select roles</FieldLabel>
                    <FilterableSelect
                      isMulti
                      options={availableRoles}
                      value={field.value}
                      onChange={field.onChange}
                      getOptionValue={(option) => option.slug}
                      getOptionLabel={(option) => option.name}
                      placeholder="Select roles..."
                    />
                    {addUserErrors.roles?.message && (
                      <FieldError>{addUserErrors.roles.message}</FieldError>
                    )}
                  </Field>
                )}
              />
            </div>
            <div className="mt-8 flex items-center justify-end gap-4">
              <Button type="button" variant="ghost" onClick={handleCloseAddUserModal}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="project"
                isDisabled={selectedUsersInModal.length === 0 || selectedRolesInModal.length === 0}
              >
                Add Users
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
