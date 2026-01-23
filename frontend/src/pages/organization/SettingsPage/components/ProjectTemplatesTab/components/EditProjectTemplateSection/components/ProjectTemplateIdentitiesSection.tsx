import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faSave, faServer, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  EmptyState,
  FilterableSelect,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge, OrgIcon, ProjectIcon } from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { useSearchOrgIdentityMemberships } from "@app/hooks/api";
import {
  TProjectTemplate,
  TProjectTemplateIdentity,
  TProjectTemplateProjectManagedIdentity,
  useUpdateProjectTemplate
} from "@app/hooks/api/projectTemplates";

type Props = {
  projectTemplate: TProjectTemplate;
  isInfisicalTemplate: boolean;
};

const formSchema = z.object({
  identities: z
    .object({
      identityId: z.string().uuid(),
      roles: z.array(z.string()).min(1, "At least one role is required")
    })
    .array(),
  projectManagedIdentities: z
    .object({
      name: z.string().trim().min(1),
      roles: z.array(z.string()).min(1, "At least one role is required")
    })
    .array()
});

type TFormSchema = z.infer<typeof formSchema>;

const addOrgIdentityFormSchema = z.object({
  selectedIdentity: z.object({
    id: z.string().uuid(),
    name: z.string()
  }),
  roles: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string()
      })
    )
    .min(1, "Select at least one role")
});

type TAddOrgIdentityForm = z.infer<typeof addOrgIdentityFormSchema>;

const addProjectIdentityFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  roles: z
    .array(
      z.object({
        slug: z.string(),
        name: z.string()
      })
    )
    .min(1, "Select at least one role")
});

type TAddProjectIdentityForm = z.infer<typeof addProjectIdentityFormSchema>;

enum AddIdentityType {
  CreateNew,
  AssignExisting
}

export const ProjectTemplateIdentitiesSection = ({
  projectTemplate,
  isInfisicalTemplate
}: Props) => {
  const [isAddIdentityModalOpen, setIsAddIdentityModalOpen] = useState(false);

  const [addMachineIdentityType, setAddMachineIdentityType] = useState<AddIdentityType>(
    AddIdentityType.CreateNew
  );

  const { data: orgIdentitiesResponse, isPending: isMembershipsLoading } =
    useSearchOrgIdentityMemberships({
      search: {}
    });
  const orgIdentities = orgIdentitiesResponse
    ? orgIdentitiesResponse.identities.map((v) => v.identity)
    : [];

  const {
    control,
    handleSubmit,
    formState: { isDirty, errors },
    reset,
    watch
  } = useForm<TFormSchema>({
    defaultValues: {
      identities: (projectTemplate.identities || []) as TProjectTemplateIdentity[],
      projectManagedIdentities: (projectTemplate.projectManagedIdentities ||
        []) as TProjectTemplateProjectManagedIdentity[]
    },
    resolver: zodResolver(formSchema)
  });

  const {
    fields: identities,
    remove: removeIdentity,
    append: appendIdentity
  } = useFieldArray({ control, name: "identities" });

  const {
    fields: projectManagedIdentities,
    remove: removeProjectManagedIdentity,
    append: appendProjectManagedIdentity
  } = useFieldArray({ control, name: "projectManagedIdentities" });

  const updateProjectTemplate = useUpdateProjectTemplate();

  const onFormSubmit = async (form: TFormSchema) => {
    await updateProjectTemplate.mutateAsync({
      identities: form.identities.length > 0 ? form.identities : null,
      projectManagedIdentities:
        form.projectManagedIdentities.length > 0 ? form.projectManagedIdentities : null,
      templateId: projectTemplate.id
    });

    reset({
      identities: form.identities,
      projectManagedIdentities: form.projectManagedIdentities
    });

    createNotification({
      text: "Project template identities updated successfully",
      type: "success"
    });
  };

  const handleDiscard = () => {
    reset({
      identities: (projectTemplate.identities || []) as TProjectTemplateIdentity[],
      projectManagedIdentities: (projectTemplate.projectManagedIdentities ||
        []) as TProjectTemplateProjectManagedIdentity[]
    });
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

  // Org identities for dropdown, excluding already added identities
  const currentIdentities = watch("identities");
  const availableOrgIdentities = useMemo(() => {
    const addedIdentityIds = new Set(currentIdentities.map((i) => i.identityId));
    return orgIdentities
      .filter((identity) => !addedIdentityIds.has(identity.id))
      .map((identity) => ({
        id: identity.id,
        name: identity.name
      }));
  }, [orgIdentities, currentIdentities]);

  const getRoleNames = (roleSlugs: string[]) => {
    return roleSlugs
      .map((slug) => {
        const role = availableRoles.find((r) => r.slug === slug);
        return role?.name || slug;
      })
      .join(", ");
  };

  const getIdentityName = (identityId: string) => {
    const identity = orgIdentities.find((i) => i.id === identityId);
    return identity?.name || identityId;
  };

  // Add org identity modal form
  const {
    control: addOrgIdentityControl,
    handleSubmit: handleAddOrgIdentitySubmit,
    reset: resetAddOrgIdentityForm,
    watch: watchAddOrgIdentity,
    formState: { errors: addOrgIdentityErrors }
  } = useForm<TAddOrgIdentityForm>({
    resolver: zodResolver(addOrgIdentityFormSchema),
    defaultValues: {
      roles: []
    }
  });

  const selectedOrgIdentity = watchAddOrgIdentity("selectedIdentity");
  const selectedOrgRolesInModal = watchAddOrgIdentity("roles");

  const handleAddOrgIdentity = (form: TAddOrgIdentityForm) => {
    appendIdentity({
      identityId: form.selectedIdentity.id,
      roles: form.roles.map((r) => r.slug)
    });
    resetAddOrgIdentityForm();
    setIsAddIdentityModalOpen(false);
  };

  // Add project-managed identity modal form
  const {
    control: addProjectIdentityControl,
    handleSubmit: handleAddProjectIdentitySubmit,
    reset: resetAddProjectIdentityForm,
    watch: watchAddProjectIdentity,
    formState: { errors: addProjectIdentityErrors }
  } = useForm<TAddProjectIdentityForm>({
    resolver: zodResolver(addProjectIdentityFormSchema),
    defaultValues: {
      name: "",
      roles: []
    }
  });

  const projectIdentityName = watchAddProjectIdentity("name");
  const selectedProjectRolesInModal = watchAddProjectIdentity("roles");

  const handleAddProjectIdentity = (form: TAddProjectIdentityForm) => {
    appendProjectManagedIdentity({
      name: form.name,
      roles: form.roles.map((r) => r.slug)
    });
    resetAddProjectIdentityForm();
    setIsAddIdentityModalOpen(false);
  };

  const handleCloseAddIdentityModal = () => {
    resetAddOrgIdentityForm();
    resetAddProjectIdentityForm();
    setIsAddIdentityModalOpen(false);
  };

  // Combined list of all identities for the table
  const allIdentitiesForTable = useMemo(() => {
    const orgManaged = identities.map((identity, index) => ({
      type: "org" as const,
      index,
      id: identity.id,
      identityId: identity.identityId,
      name: getIdentityName(identity.identityId),
      roles: currentIdentities[index]?.roles || []
    }));

    const projectManaged = projectManagedIdentities.map((identity, index) => ({
      type: "project" as const,
      index,
      id: identity.id,
      name: identity.name,
      roles: watch(`projectManagedIdentities.${index}.roles`) || []
    }));

    return [...projectManaged, ...orgManaged];
  }, [identities, projectManagedIdentities, currentIdentities, orgIdentities, watch]);

  return (
    <>
      <form
        onSubmit={handleSubmit(onFormSubmit)}
        className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
      >
        <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
          <div>
            <h2 className="text-lg font-medium">Project Machine Identities</h2>
            <p className="text-sm text-mineshaft-400">
              {isInfisicalTemplate
                ? "Machine identities that will be automatically added to projects created from this template"
                : "Add machine identities that will be automatically added to projects created from this template"}
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
                    onClick={() => setIsAddIdentityModalOpen(true)}
                    colorSchema="primary"
                    variant="outline_bg"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    isDisabled={!isAllowed}
                    type="button"
                  >
                    Add Identity
                  </Button>
                </div>
              )}
            </OrgPermissionCan>
          )}
        </div>
        {errors.identities && (
          <span className="my-4 text-sm text-red">{errors.identities.message}</span>
        )}
        {errors.projectManagedIdentities && (
          <span className="my-4 text-sm text-red">{errors.projectManagedIdentities.message}</span>
        )}
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Identity</Th>
                <Th>Roles</Th>
                <Th>Managed by</Th>
                {!isInfisicalTemplate && <Th className="w-16" />}
              </Tr>
            </THead>
            <TBody>
              {allIdentitiesForTable.length > 0 ? (
                allIdentitiesForTable.map((item) => (
                  <Tr key={item.id}>
                    <Td className="w-1/4 max-w-0">
                      <p className="truncate">
                        <span className="text-sm">{item.name}</span>
                      </p>
                    </Td>
                    <Td>
                      {isInfisicalTemplate ? (
                        <span className="text-sm">{getRoleNames(item.roles)}</span>
                      ) : (
                        <OrgPermissionCan
                          I={OrgPermissionActions.Edit}
                          a={OrgPermissionSubjects.ProjectTemplates}
                        >
                          {(isAllowed) => (
                            <Controller
                              control={control}
                              name={
                                item.type === "org"
                                  ? `identities.${item.index}.roles`
                                  : `projectManagedIdentities.${item.index}.roles`
                              }
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
                    <Td>
                      <Badge variant={item.type === "project" ? "project" : "org"}>
                        {item.type === "project" ? (
                          <>
                            <ProjectIcon />
                            Project
                          </>
                        ) : (
                          <>
                            <OrgIcon />
                            Organization
                          </>
                        )}
                      </Badge>
                    </Td>
                    {!isInfisicalTemplate && (
                      <Td>
                        <OrgPermissionCan
                          I={OrgPermissionActions.Edit}
                          a={OrgPermissionSubjects.ProjectTemplates}
                        >
                          {(isAllowed) => (
                            <IconButton
                              onClick={() => {
                                if (item.type === "org") {
                                  removeIdentity(item.index);
                                } else {
                                  removeProjectManagedIdentity(item.index);
                                }
                              }}
                              colorSchema="danger"
                              variant="plain"
                              ariaLabel="Remove identity"
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
                  <Td colSpan={isInfisicalTemplate ? 3 : 4}>
                    <EmptyState
                      title="No machine identities assigned to this template"
                      icon={faServer}
                    />
                  </Td>
                </Tr>
              )}
            </TBody>
          </Table>
        </TableContainer>
      </form>

      {/* Add Identity Modal */}
      <Modal isOpen={isAddIdentityModalOpen} onOpenChange={setIsAddIdentityModalOpen}>
        <ModalContent
          bodyClassName="overflow-visible"
          title="Add Machine Identity to Template"
          subTitle="Create a new machine identity or assign an existing one"
        >
          <div className="mb-4 flex items-center justify-center gap-x-2">
            <div className="flex w-3/4 gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
              <Button
                variant="outline_bg"
                onClick={() => {
                  setAddMachineIdentityType(AddIdentityType.CreateNew);
                }}
                size="xs"
                className={twMerge(
                  "min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600",
                  addMachineIdentityType === AddIdentityType.CreateNew
                    ? "bg-mineshaft-500"
                    : "bg-transparent"
                )}
              >
                Create New
              </Button>
              <Button
                variant="outline_bg"
                onClick={() => {
                  setAddMachineIdentityType(AddIdentityType.AssignExisting);
                }}
                size="xs"
                className={twMerge(
                  "min-w-[2.4rem] flex-1 rounded border-none hover:bg-mineshaft-600",
                  addMachineIdentityType === AddIdentityType.AssignExisting
                    ? "bg-mineshaft-500"
                    : "bg-transparent"
                )}
              >
                Assign Existing
              </Button>
            </div>
            <Tooltip
              className="max-w-sm"
              position="right"
              align="start"
              content={
                <>
                  <p className="mb-2 text-mineshaft-300">
                    You can add machine identities to your template in one of two ways:
                  </p>
                  <ul className="ml-3.5 flex list-disc flex-col gap-y-4">
                    <li className="text-mineshaft-200">
                      <strong className="font-medium text-mineshaft-100">Create New</strong> -
                      Define a new machine identity that will be created when a project is made from
                      this template.
                      <p className="mt-2">
                        This method is recommended for autonomous teams that need to manage machine
                        identity authentication at the project level.
                      </p>
                    </li>
                    <li>
                      <strong className="font-medium text-mineshaft-100">Assign Existing</strong> -
                      Assign an existing machine identity from your organization.
                      <p className="mt-2">
                        This method is recommended for organizations that need to maintain
                        centralized control.
                      </p>
                    </li>
                  </ul>
                </>
              }
            >
              <InfoIcon size={16} className="text-mineshaft-400" />
            </Tooltip>
          </div>
          {addMachineIdentityType === AddIdentityType.CreateNew && (
            <form onSubmit={handleAddProjectIdentitySubmit(handleAddProjectIdentity)}>
              <Controller
                control={addProjectIdentityControl}
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Name"
                    errorText={error?.message}
                    isError={Boolean(error)}
                    className="mb-4"
                  >
                    <Input {...field} autoFocus placeholder="Machine Identity 1" />
                  </FormControl>
                )}
              />
              <Controller
                control={addProjectIdentityControl}
                name="roles"
                render={({ field }) => (
                  <FormControl
                    label="Select roles"
                    isError={Boolean(addProjectIdentityErrors.roles)}
                    errorText={addProjectIdentityErrors.roles?.message}
                    tooltipText="Select the roles that will be assigned to this identity"
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
              <div className="flex items-center">
                <Button
                  className="mr-4"
                  size="sm"
                  type="submit"
                  isDisabled={!projectIdentityName || selectedProjectRolesInModal.length === 0}
                >
                  Add to Template
                </Button>
                <Button
                  type="button"
                  colorSchema="secondary"
                  variant="plain"
                  onClick={handleCloseAddIdentityModal}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
          {addMachineIdentityType === AddIdentityType.AssignExisting && (
            <form onSubmit={handleAddOrgIdentitySubmit(handleAddOrgIdentity)}>
              <Controller
                control={addOrgIdentityControl}
                name="selectedIdentity"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <FormControl
                    label="Machine Identity"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <FilterableSelect
                      value={value}
                      onChange={onChange}
                      isLoading={isMembershipsLoading}
                      placeholder="Select machine identity..."
                      autoFocus
                      options={availableOrgIdentities}
                      getOptionValue={(option) => option.id}
                      getOptionLabel={(option) => option.name}
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={addOrgIdentityControl}
                name="roles"
                render={({ field }) => (
                  <FormControl
                    label="Select roles"
                    isError={Boolean(addOrgIdentityErrors.roles)}
                    errorText={addOrgIdentityErrors.roles?.message}
                    tooltipText="Select the roles that will be assigned to the selected identity"
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
              <div className="flex items-center">
                <Button
                  className="mr-4"
                  size="sm"
                  type="submit"
                  isDisabled={!selectedOrgIdentity || selectedOrgRolesInModal.length === 0}
                >
                  Assign to Template
                </Button>
                <Button
                  type="button"
                  colorSchema="secondary"
                  variant="plain"
                  onClick={handleCloseAddIdentityModal}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};
