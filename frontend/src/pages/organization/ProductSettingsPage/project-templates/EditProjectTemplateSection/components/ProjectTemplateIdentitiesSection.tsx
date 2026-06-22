import { useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon, Plus, Save, Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
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
  Input,
  OrgIcon,
  ProjectIcon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useDebounce } from "@app/hooks";
import { useSearchOrgIdentityMemberships } from "@app/hooks/api";
import {
  TProjectTemplate,
  TProjectTemplateIdentity,
  TProjectTemplateProjectManagedIdentity,
  useUpdateProjectTemplate
} from "@app/hooks/api/projectTemplates";

type Props = {
  projectTemplate: TProjectTemplate;
};

const formSchema = z.object({
  identities: z
    .object({
      identityId: z.string().uuid(),
      identityName: z.string(),
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

export const ProjectTemplateIdentitiesSection = ({ projectTemplate }: Props) => {
  const { currentOrg } = useOrganization();

  const [isAddIdentityModalOpen, setIsAddIdentityModalOpen] = useState(false);

  const [addMachineIdentityType, setAddMachineIdentityType] = useState<AddIdentityType>(
    AddIdentityType.CreateNew
  );

  const [identitySearchInput, setIdentitySearchInput] = useState("");
  const [debouncedIdentitySearch] = useDebounce(identitySearchInput, 300);

  const { data: searchedIdentitiesResponse, isPending: isSearchingIdentities } =
    useSearchOrgIdentityMemberships({
      orgId: currentOrg.id,
      limit: 100,
      search: debouncedIdentitySearch ? { name: { $contains: debouncedIdentitySearch } } : {}
    });
  const searchedIdentities = searchedIdentitiesResponse
    ? searchedIdentitiesResponse.identities.map((v) => v.identity)
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

  const currentIdentities = watch("identities");
  const availableOrgIdentities = useMemo(() => {
    const addedIdentityIds = new Set(currentIdentities.map((i) => i.identityId));
    return searchedIdentities
      .filter((identity) => !addedIdentityIds.has(identity.id))
      .map((identity) => ({
        id: identity.id,
        name: identity.name
      }));
  }, [searchedIdentities, currentIdentities]);

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
      identityName: form.selectedIdentity.name,
      roles: form.roles.map((r) => r.slug)
    });
    resetAddOrgIdentityForm();
    setIdentitySearchInput("");
    setIsAddIdentityModalOpen(false);
  };

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
    setIdentitySearchInput("");
    setIsAddIdentityModalOpen(false);
  };

  const allIdentitiesForTable = useMemo(() => {
    const orgManaged = identities.map((identity, index) => ({
      type: "org" as const,
      index,
      id: identity.id,
      identityId: identity.identityId,
      name: identity.identityName,
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
  }, [identities, projectManagedIdentities, currentIdentities, watch]);

  return (
    <>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Project Machine Identities</CardTitle>
            <CardDescription>
              Add machine identities that will be automatically added to projects created from this
              template.
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
                      onClick={() => setIsAddIdentityModalOpen(true)}
                      variant="project"
                      isDisabled={!isAllowed}
                      type="button"
                    >
                      <Plus className="size-4" />
                      Add Machine Identity
                    </Button>
                  </div>
                )}
              </OrgPermissionCan>
            </CardAction>
          </CardHeader>
          <CardContent>
            {errors.identities && (
              <span className="my-4 text-sm text-danger">{errors.identities.message}</span>
            )}
            {errors.projectManagedIdentities && (
              <span className="my-4 text-sm text-danger">
                {errors.projectManagedIdentities.message}
              </span>
            )}
            {allIdentitiesForTable.length > 0 ? (
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead>Identity</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead className="w-40">Managed By</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allIdentitiesForTable.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="py-2">
                        <p className="truncate">
                          <span className="truncate text-sm font-medium text-mineshaft-100">
                            {item.name}
                          </span>
                        </p>
                      </TableCell>
                      <TableCell className="py-2">
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
                        <Badge variant={item.type === "project" ? "project" : "org"}>
                          {item.type === "project" ? <ProjectIcon /> : <OrgIcon />}
                          {item.type === "project" ? "Project" : "Organization"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex justify-end">
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
                                variant="ghost-muted"
                                size="xs"
                                aria-label="Remove identity"
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
                  <EmptyTitle>No machine identities assigned to this template</EmptyTitle>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      </form>

      <Dialog open={isAddIdentityModalOpen} onOpenChange={setIsAddIdentityModalOpen}>
        <DialogContent className="max-w-xl overflow-visible">
          <DialogHeader>
            <DialogTitle>Add Machine Identity to Template</DialogTitle>
            <DialogDescription>
              Create a new machine identity or assign an existing one
            </DialogDescription>
          </DialogHeader>
          <div className="mb-4 flex items-center justify-center gap-x-2">
            <Tabs
              value={String(addMachineIdentityType)}
              onValueChange={(val) => setAddMachineIdentityType(Number(val) as AddIdentityType)}
              className="w-3/4"
            >
              <TabsList variant="filled" className="w-full">
                <TabsTrigger value={String(AddIdentityType.CreateNew)}>Create New</TabsTrigger>
                <TabsTrigger value={String(AddIdentityType.AssignExisting)}>
                  Assign Existing
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon size={16} className="text-mineshaft-400" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm" side="right" align="start">
                <p className="mb-2 text-mineshaft-300">
                  You can add machine identities to your template in one of two ways:
                </p>
                <ul className="ml-3.5 flex list-disc flex-col gap-y-4">
                  <li className="text-mineshaft-200">
                    <strong className="font-medium text-mineshaft-100">Create New</strong> - Define
                    a new machine identity that will be created when a project is made from this
                    template.
                    <p className="mt-2">
                      This method is recommended for autonomous teams that need to manage machine
                      identity authentication at the project level.
                    </p>
                  </li>
                  <li>
                    <strong className="font-medium text-mineshaft-100">Assign Existing</strong> -
                    Assign an existing machine identity from your organization.
                    <p className="mt-2">
                      This method is recommended for organizations that need to maintain centralized
                      control.
                    </p>
                  </li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </div>
          {addMachineIdentityType === AddIdentityType.CreateNew && (
            <form onSubmit={handleAddProjectIdentitySubmit(handleAddProjectIdentity)}>
              <Controller
                control={addProjectIdentityControl}
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel>Name</FieldLabel>
                    <Input {...field} autoFocus placeholder="Machine Identity 1" />
                    {error?.message && <FieldError>{error.message}</FieldError>}
                  </Field>
                )}
              />
              <Controller
                control={addProjectIdentityControl}
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
                    {addProjectIdentityErrors.roles?.message && (
                      <FieldError>{addProjectIdentityErrors.roles.message}</FieldError>
                    )}
                  </Field>
                )}
              />
              <div className="mt-4 flex items-center justify-end gap-4">
                <Button type="button" variant="ghost" onClick={handleCloseAddIdentityModal}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  variant="project"
                  isDisabled={!projectIdentityName || selectedProjectRolesInModal.length === 0}
                >
                  Add to Template
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
                  <Field>
                    <FieldLabel>Machine Identity</FieldLabel>
                    <FilterableSelect
                      value={value}
                      onChange={onChange}
                      isLoading={isSearchingIdentities}
                      placeholder="Select machine identity..."
                      autoFocus
                      options={availableOrgIdentities}
                      getOptionValue={(option) => option.id}
                      getOptionLabel={(option) => option.name}
                      onInputChange={(newValue) => setIdentitySearchInput(newValue)}
                      filterOption={() => true}
                    />
                    {error?.message && <FieldError>{error.message}</FieldError>}
                  </Field>
                )}
              />
              <Controller
                control={addOrgIdentityControl}
                name="roles"
                render={({ field }) => (
                  <Field className="mt-4">
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
                    {addOrgIdentityErrors.roles?.message && (
                      <FieldError>{addOrgIdentityErrors.roles.message}</FieldError>
                    )}
                  </Field>
                )}
              />
              <div className="mt-4 flex items-center justify-end gap-4">
                <Button type="button" variant="ghost" onClick={handleCloseAddIdentityModal}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  variant="project"
                  isDisabled={!selectedOrgIdentity || selectedOrgRolesInModal.length === 0}
                >
                  Assign to Template
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
