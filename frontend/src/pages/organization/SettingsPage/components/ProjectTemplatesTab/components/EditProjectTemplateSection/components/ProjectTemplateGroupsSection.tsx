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
import { useGetOrganizationGroups } from "@app/hooks/api";
import {
  TProjectTemplate,
  TProjectTemplateGroup,
  useUpdateProjectTemplate
} from "@app/hooks/api/projectTemplates";

type Props = {
  projectTemplate: TProjectTemplate;
  isInfisicalTemplate: boolean;
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

export const ProjectTemplateGroupsSection = ({ projectTemplate, isInfisicalTemplate }: Props) => {
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

  // Available roles from template (predefined + custom)
  const availableRoles = useMemo(() => {
    const predefinedRoles = [
      { slug: "admin", name: "Admin" },
      { slug: "member", name: "Developer" },
      { slug: "viewer", name: "Viewer" },
      { slug: "no-access", name: "No Access" }
    ];

    const customRoles = projectTemplate.roles
      .filter((role) => !["admin", "member", "viewer", "no-access", "custom"].includes(role.slug))
      .map((role) => ({ slug: role.slug, name: role.name }));

    return [...predefinedRoles, ...customRoles];
  }, [projectTemplate.roles]);

  // Org groups for dropdown, excluding already added groups
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

  const getRoleNames = (roleSlugs: string[]) => {
    return roleSlugs
      .map((slug) => {
        const role = availableRoles.find((r) => r.slug === slug);
        return role?.name || slug;
      })
      .join(", ");
  };

  const getGroupName = (groupSlug: string) => {
    const group = orgGroups?.find((g) => g.slug.toLowerCase() === groupSlug.toLowerCase());
    return group?.name || groupSlug;
  };

  // Add group modal form
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
      <form
        onSubmit={handleSubmit(onFormSubmit)}
        className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      >
        <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
          <div>
            <h2 className="text-lg font-medium">Project Groups</h2>
            <p className="text-sm text-mineshaft-400">
              {isInfisicalTemplate
                ? "Groups that will be automatically added to projects created from this template"
                : "Add groups that will be automatically added to projects created from this template"}
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
                    onClick={() => setIsAddGroupModalOpen(true)}
                    colorSchema="primary"
                    variant="outline_bg"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    isDisabled={!isAllowed || availableOrgGroups.length === 0}
                    type="button"
                  >
                    Add Group
                  </Button>
                </div>
              )}
            </OrgPermissionCan>
          )}
        </div>
        {errors.groups && <span className="my-4 text-sm text-red">{errors.groups.message}</span>}
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Group</Th>
                <Th>Roles</Th>
                {!isInfisicalTemplate && <Th className="w-16" />}
              </Tr>
            </THead>
            <TBody>
              {groups.length > 0 ? (
                groups.map(({ id }, pos) => (
                  <Tr key={id}>
                    <Td className="w-1/4 max-w-0">
                      <Controller
                        control={control}
                        name={`groups.${pos}.groupSlug`}
                        render={({ field }) => (
                          <p className="truncate">
                            <span className="text-sm">{getGroupName(field.value)}</span>
                          </p>
                        )}
                      />
                    </Td>
                    <Td>
                      {isInfisicalTemplate ? (
                        <Controller
                          control={control}
                          name={`groups.${pos}.roles`}
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
                              name={`groups.${pos}.roles`}
                              render={({ field, fieldState: { error } }) => {
                                // Include orphaned roles
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
                                  <FormControl
                                    isError={Boolean(error?.message)}
                                    errorText={error?.message}
                                    className="mb-0"
                                  >
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
                                  </FormControl>
                                );
                              }}
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
                              ariaLabel="Remove group"
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
                    <EmptyState title="No groups assigned to this template" icon={faUsers} />
                  </Td>
                </Tr>
              )}
            </TBody>
          </Table>
        </TableContainer>
      </form>

      {/* Add Group Modal */}
      <Modal isOpen={isAddGroupModalOpen} onOpenChange={setIsAddGroupModalOpen}>
        <ModalContent
          title="Add Groups to Template"
          subTitle="Select groups and roles to add to this project template"
          bodyClassName="overflow-visible"
        >
          <form onSubmit={handleAddGroupSubmit(handleAddGroups)}>
            <div className="flex flex-col gap-4">
              <Controller
                control={addGroupControl}
                name="selectedGroups"
                render={({ field }) => (
                  <FormControl
                    label="Select groups"
                    isError={Boolean(addGroupErrors.selectedGroups)}
                    errorText={addGroupErrors.selectedGroups?.message}
                  >
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
                  </FormControl>
                )}
              />
              <Controller
                control={addGroupControl}
                name="roles"
                render={({ field }) => (
                  <FormControl
                    label="Select roles"
                    isError={Boolean(addGroupErrors.roles)}
                    errorText={addGroupErrors.roles?.message}
                    tooltipText="Select the roles that will be assigned to the selected groups"
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
                isDisabled={selectedGroupsInModal.length === 0 || selectedRolesInModal.length === 0}
              >
                Add Groups
              </Button>
              <Button
                type="button"
                colorSchema="secondary"
                variant="plain"
                onClick={handleCloseAddGroupModal}
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
