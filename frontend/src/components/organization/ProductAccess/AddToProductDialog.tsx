import { useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { getProjectLucideIcon } from "@app/helpers/project";
import { useScopeVariant } from "@app/hooks";
import { useGetUserProjects } from "@app/hooks/api";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { PRODUCT_DEFINITIONS } from "@app/pages/organization/AccessManagementPage/components/OrgMembersTab/components/OrgMembersSection/ProjectAssignmentFields";
import {
  DEFAULT_PROJECT_ROLE,
  ProjectRoleSelect
} from "@app/pages/organization/AccessManagementPage/components/OrgMembersTab/components/OrgMembersSection/ProjectRoleSelect";

import { useIsNamedByProduct } from "./products";

const schema = z.object({
  productType: z.nativeEnum(ProjectType, { required_error: "Select a product" }),
  projects: z
    .object({ id: z.string(), name: z.string(), type: z.string().optional() })
    .array()
    .default([]),
  role: z.object(
    { slug: z.string().min(1), name: z.string().min(1) },
    {
      required_error: "Select a role",
      invalid_type_error: "Select a role"
    }
  )
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  actorLabel: string;
  title: string;
  memberProjectIds?: string[];
  isMembershipsLoading: boolean;
  isMembershipsError: boolean;
  excludeV1Projects?: boolean;
  onAddToProject: (
    project: { id: string; type: ProjectType },
    roleSlug: string
  ) => Promise<unknown>;
};

export const AddToProductDialog = ({
  isOpen,
  onOpenChange,
  actorLabel,
  title,
  memberProjectIds,
  isMembershipsLoading,
  isMembershipsError,
  excludeV1Projects = false,
  onAddToProject
}: Props) => {
  const { currentOrg } = useOrganization();
  const scopeVariant = useScopeVariant();
  const orgId = currentOrg?.id || "";
  const { data: projects = [], isPending: isProjectsLoading } = useGetUserProjects();
  const isNamedByProduct = useIsNamedByProduct();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { projects: [], role: DEFAULT_PROJECT_ROLE }
  });

  // Until the memberships load, the pickers cannot leave out projects the actor already belongs to.
  const isMembershipsReady = !isMembershipsLoading && !isMembershipsError;

  const availableProjectsByType = useMemo(() => {
    const memberIds = new Set(memberProjectIds);
    const grouped = new Map<string, typeof projects>();
    projects
      .filter(
        ({ id, orgId: projectOrgId, version }) =>
          !memberIds.has(id) &&
          projectOrgId === orgId &&
          !(excludeV1Projects && version === ProjectVersion.V1)
      )
      .forEach((project) => {
        grouped.set(project.type, [...(grouped.get(project.type) ?? []), project]);
      });
    return grouped;
  }, [projects, memberProjectIds, orgId, excludeV1Projects]);

  const availableProducts = PRODUCT_DEFINITIONS.filter((product) =>
    availableProjectsByType.has(product.type)
  );

  const productType = useWatch({ control, name: "productType" });
  const selectedProjects = useWatch({ control, name: "projects" }) ?? [];
  const product = PRODUCT_DEFINITIONS.find((definition) => definition.type === productType);
  const productProjects = productType ? (availableProjectsByType.get(productType) ?? []) : [];
  const isProjectPickerShown =
    Boolean(productType) && !(isNamedByProduct(productType) && productProjects.length === 1);
  const targetProjects = isProjectPickerShown ? selectedProjects : productProjects;

  useEffect(() => {
    setValue("role", DEFAULT_PROJECT_ROLE);
  }, [productType, targetProjects.length === 1 ? targetProjects[0].id : undefined]);

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) reset();
  };

  const onFormSubmit = async ({ role }: FormData) => {
    if (!product) return;
    if (!targetProjects.length) {
      setError("projects", { message: "Select at least one project" });
      return;
    }

    const results = await Promise.allSettled(
      targetProjects.map((project) =>
        onAddToProject({ id: project.id, type: product.type }, role.slug)
      )
    );
    const failedCount = results.filter((result) => result.status === "rejected").length;

    if (failedCount === targetProjects.length) return;

    if (failedCount) {
      createNotification({
        text: `Added ${actorLabel} to ${targetProjects.length - failedCount} of ${targetProjects.length} ${product.name} projects`,
        type: "warning"
      });
    } else {
      createNotification({
        text: `Successfully added ${actorLabel} to ${product.name}`,
        type: "success"
      });
    }

    handleOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent isPending={isSubmitting}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choose a product, then the projects to add this {actorLabel} to.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
          <Controller
            control={control}
            name="productType"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="add-to-product-product">Product</FieldLabel>
                <Select
                  value={value ?? ""}
                  onValueChange={(type) => {
                    onChange(type);
                    setValue("projects", []);
                  }}
                  disabled={isProjectsLoading || !isMembershipsReady || !availableProducts.length}
                >
                  <SelectTrigger
                    id="add-to-product-product"
                    className="w-full"
                    isError={Boolean(error)}
                  >
                    <SelectValue
                      placeholder={
                        !isProjectsLoading && isMembershipsReady && !availableProducts.length
                          ? "Already a member of everything you can access"
                          : "Select a product..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    {availableProducts.map(({ type, name }) => {
                      const Icon = getProjectLucideIcon(type);
                      return (
                        <SelectItem key={type} value={type}>
                          <span className="flex items-center gap-2">
                            <Icon />
                            {name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FieldError>
                  {error?.message ??
                    (isMembershipsError
                      ? `Could not load this ${actorLabel}'s memberships. Close and try again.`
                      : undefined)}
                </FieldError>
              </Field>
            )}
          />
          {isProjectPickerShown && (
            <Controller
              control={control}
              name="projects"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="add-to-product-projects">Projects</FieldLabel>
                  <Combobox
                    id="add-to-product-projects"
                    multiple
                    value={value}
                    onValueChange={onChange}
                    options={productProjects}
                    getOptionValue={(option) => option.id}
                    getOptionLabel={(option) => option.name}
                    placeholder="Select projects..."
                    searchPlaceholder="Search projects..."
                    searchAriaLabel="Search projects"
                    clearAriaLabel="Clear all projects"
                    emptyMessage="No projects found."
                    isError={Boolean(error)}
                    modal
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          )}
          {product && (
            <Controller
              control={control}
              name="role"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="add-to-product-role">Role</FieldLabel>
                  <ProjectRoleSelect
                    inputId="add-to-product-role"
                    value={value}
                    onChange={onChange}
                    isError={Boolean(error)}
                    selectedProjects={targetProjects}
                    fixedRoles={product.roles}
                    productType={product.type}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              isDisabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={scopeVariant}
              isPending={isSubmitting}
              isDisabled={isSubmitting || !isMembershipsReady || !product}
            >
              Add to Product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
