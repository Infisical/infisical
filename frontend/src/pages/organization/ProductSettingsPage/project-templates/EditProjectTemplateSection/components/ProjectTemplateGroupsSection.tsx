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
import { useGetOrganizationGroups } from "@app/hooks/api";
import {
  TProjectTemplate,
  TProjectTemplateGroup,
  useUpdateProjectTemplate
} from "@app/hooks/api/projectTemplates";

type Props = {
  projectTemplate: TProjectTemplate;
};

const formSchema = z.object({
  groups: z
    .object({
      groupSlug: z.string().min(1),
      roles: z.array(z.string()).min(1, "At least one role is required")
    })
    .array()
});

type TFormSchema = z.infer<typeof formSchema>;

const addGroupFormSchema = z.object({
  selectedGroups: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string()
      })
    )
    .min(1, "Select at least one group"),
  roles: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string()
      })
    )
    .min(1, "Select at least one role")
});

type TAddGroupForm = z.infer<typeof addGroupFormSchema>;

export const ProjectTemplateGroupsSection = ({ projectTemplate }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const [isAddGroupModalOpen, setIsAddGroupModalOpen] = useState(false);

  const { data: orgGroups } = useGetOrganizationGroups(orgId);

  const {
    control,
    handleSubmit,
    formState: { isDirty, errors },
    reset,
    watch
  } = useForm<TFormSchema>({
    defaultValues: {
      groups: (projectTemplate.groups || []) as TProjectTemplateGroup[]
    },
    resolver: zodResolver(formSchema)
  });

  const { fields: groups, remove, append } = useFieldArray({ control, name: "groups" });

  const updateProjectTemplate = useUpdateProjectTemplate();

  const onFormSubmit = async (form: TFormSchema) => {
    await updateProjectTemplate.mutateAsync({
      groups: form.groups.length > 0 ? form.groups : null,
      templateId: projectTemplate.id
    });

    reset({ groups: form.groups });

    createNotification({
      text: "Project template groups updated successfully",
      type: "success"
    });
  };

  const handleDiscard = () => {
    reset({ groups: (projectTemplate.groups || []) as TProjectTemplateGroup[] });
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

  const currentGroups = watch("groups");
  const availableOrgGroups = useMemo(() => {
    const addedGroupSlugs = new Set(currentGroups.map((g) => g.groupSlug.toLowerCase()));
    return (orgGroups || [])
      .filter((group) => !addedGroupSlugs.has(group.slug.toLowerCase()))
      .map((group) => ({
        slug: group.slug,
        name: group.name
      }));
  }, [orgGroups, currentGroups]);

  const getGroupName = (groupSlug: string) => {
    const group = orgGroups?.find((g) => g.slug.toLowerCase() === groupSlug.toLowerCase());
    return group?.name || groupSlug;
  };

  const {
    control: addGroupControl,
    handleSubmit: handleAddGroupSubmit,
    reset: resetAddGroupForm,
    watch: watchAddGroup,
    formState: { errors: addGroupErrors }
  } = useForm<TAddGroupForm>({
    resolver: zodResolver(addGroupFormSchema),
    defaultValues: {
      selectedGroups: [],
      roles: []
    }
  });

  const selectedGroupsInModal = watchAddGroup("selectedGroups");
  const selectedRolesInModal = watchAddGroup("roles");

  const handleAddGroups = (form: TAddGroupForm) => {
    form.selectedGroups.forEach((group) => {
      append({
        groupSlug: group.slug,
        roles: form.roles.map((r) => r.slug)
      });
    });
    resetAddGroupForm();
    setIsAddGroupModalOpen(false);
  };

  const handleCloseAddGroupModal = () => {
    resetAddGroupForm();
    setIsAddGroupModalOpen(false);
  };

  return (
    <>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Project Groups</CardTitle>
            <CardDescription>
              Add groups that will be automatically added to projects created from this template.
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
                      onClick={() => setIsAddGroupModalOpen(true)}
                      variant="project"
                      isDisabled={!isAllowed}
                      type="button"
                    >
                      <Plus className="size-4" />
                      Add Group
                    </Button>
                  </div>
                )}
              </OrgPermissionCan>
            </CardAction>
          </CardHeader>
          <CardContent>
            {errors.groups && (
              <span className="my-4 text-sm text-danger">{errors.groups.message}</span>
            )}
            {groups.length > 0 ? (
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map(({ id }, pos) => (
                    <TableRow key={id}>
                      <TableCell className="py-2">
                        <Controller
                          control={control}
                          name={`groups.${pos}.groupSlug`}
                          render={({ field }) => (
                            <p className="truncate">
                              <span className="text-sm font-medium text-mineshaft-100">
                                {getGroupName(field.value)}
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
                              name={`groups.${pos}.roles`}
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
                                aria-label="Remove group"
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
                  <EmptyTitle>No groups assigned to this template</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </form>

      <Dialog open={isAddGroupModalOpen} onOpenChange={setIsAddGroupModalOpen}>
        <DialogContent className="max-w-xl overflow-visible">
          <DialogHeader>
            <DialogTitle>Add Groups to Template</DialogTitle>
            <DialogDescription>
              Select groups and roles to add to this project template
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddGroupSubmit(handleAddGroups)}>
            <div className="flex flex-col gap-4">
              <Controller
                control={addGroupControl}
                name="selectedGroups"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>Select groups</FieldLabel>
                    <FilterableSelect
                      isMulti
                      options={availableOrgGroups}
                      value={field.value}
                      onChange={field.onChange}
                      getOptionValue={(option) => option.slug}
                      getOptionLabel={(option) => option.name}
                      placeholder="Select one or more groups..."
                      noOptionsMessage={() =>
                        availableOrgGroups.length === 0
                          ? "All organization groups have been added"
                          : "No matching groups found"
                      }
                    />
                    {addGroupErrors.selectedGroups?.message && (
                      <FieldError>{addGroupErrors.selectedGroups.message}</FieldError>
                    )}
                  </Field>
                )}
              />
              <Controller
                control={addGroupControl}
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
                    {addGroupErrors.roles?.message && (
                      <FieldError>{addGroupErrors.roles.message}</FieldError>
                    )}
                  </Field>
                )}
              />
            </div>
            <div className="mt-8 flex items-center justify-end gap-4">
              <Button type="button" variant="ghost" onClick={handleCloseAddGroupModal}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="project"
                isDisabled={selectedGroupsInModal.length === 0 || selectedRolesInModal.length === 0}
              >
                Add Groups
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
