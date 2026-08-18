import { useEffect, useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { components, OptionProps, SingleValueProps } from "react-select";
import { CheckIcon, Info } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getProjectLucideIcon, getProjectTitle } from "@app/helpers/project";
import { useGetUserProjects } from "@app/hooks/api";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";

import {
  CERT_MANAGER_ROLES,
  DEFAULT_PROJECT_ROLE,
  getSingleSelectedProjectId,
  PAM_ROLES,
  ProjectRoleSelect
} from "./ProjectRoleSelect";

type ProductDefinition = {
  type: ProjectType;
  name: string;
  isSingleton: boolean;
  roles?: { slug: string; name: string; description: string }[];
};

// Names come from the shared getProjectTitle util so the select matches the Projects pages.
const PRODUCT_DEFINITIONS: ProductDefinition[] = [
  {
    type: ProjectType.SecretManager,
    name: getProjectTitle(ProjectType.SecretManager),
    isSingleton: false
  },
  {
    type: ProjectType.CertificateManager,
    name: getProjectTitle(ProjectType.CertificateManager),
    isSingleton: true,
    roles: CERT_MANAGER_ROLES
  },
  { type: ProjectType.KMS, name: getProjectTitle(ProjectType.KMS), isSingleton: false },
  {
    type: ProjectType.SecretScanning,
    name: getProjectTitle(ProjectType.SecretScanning),
    isSingleton: false
  },
  {
    type: ProjectType.PAM,
    name: getProjectTitle(ProjectType.PAM),
    isSingleton: true,
    roles: PAM_ROLES
  }
];

// Render each product with its shared project icon (getProjectLucideIcon) so the select matches the
// Projects pages and the org sidebar.
const ProductOption = ({ isSelected, children, ...props }: OptionProps<ProductDefinition>) => {
  const Icon = getProjectLucideIcon(props.data.type);
  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted" />
        <p className="mr-auto truncate">{children}</p>
        {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
      </div>
    </components.Option>
  );
};

const ProductSingleValue = ({ children, ...props }: SingleValueProps<ProductDefinition>) => {
  const Icon = getProjectLucideIcon(props.data.type);
  return (
    <components.SingleValue {...props}>
      <div className="flex flex-row items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted" />
        <span className="truncate">{children}</span>
      </div>
    </components.SingleValue>
  );
};

export const projectAssignmentSchema = z.object({
  product: z
    .object({
      type: z.nativeEnum(ProjectType),
      name: z.string(),
      isSingleton: z.boolean(),
      roles: z
        .object({
          slug: z.string(),
          name: z.string(),
          description: z.string()
        })
        .array()
        .optional()
    })
    .optional(),
  projects: z
    .array(
      z.object({
        name: z.string(),
        id: z.string(),
        slug: z.string(),
        version: z.nativeEnum(ProjectVersion),
        type: z.nativeEnum(ProjectType).optional()
      })
    )
    .default([]),
  projectRole: z
    .object({
      slug: z.string().min(1),
      name: z.string().min(1)
    })
    .default(DEFAULT_PROJECT_ROLE)
});

export type TProjectAssignmentFields = z.infer<typeof projectAssignmentSchema>;

type TTargetProject = {
  id: string;
  name: string;
  version: ProjectVersion;
  type?: ProjectType | string;
};

// Resolves which projects the submitted users should be added to: the product's single
// project for singleton products, the selected projects otherwise. Returns null (after
// notifying) when a selected project is on an incompatible version.
export const resolveTargetProjects = (
  product: TProjectAssignmentFields["product"],
  selectedProjects: TTargetProject[],
  allProjects: TTargetProject[] | undefined
): TTargetProject[] | null => {
  if (product?.isSingleton) {
    const singletonProject = allProjects?.find((p) => p.type === product.type);
    return singletonProject ? [singletonProject] : [];
  }

  if (!product) return [];

  const incompatibleProject = selectedProjects.find((p) => p.version !== ProjectVersion.V3);
  if (incompatibleProject) {
    createNotification({
      type: "error",
      text: `Cannot add users to project "${incompatibleProject.name}" because it's incompatible. Please upgrade the project.`
    });
    return null;
  }

  return selectedProjects;
};

export const ProjectAssignmentFields = () => {
  const { control, setValue } = useFormContext<TProjectAssignmentFields>();

  const { data: rawProjects, isPending: isProjectsLoading } = useGetUserProjects({
    includeRoles: true
  });

  const availableProducts = useMemo(
    () => PRODUCT_DEFINITIONS.filter((def) => rawProjects?.some((p) => p.type === def.type)),
    [rawProjects]
  );

  const selectedProduct = useWatch({ control, name: "product" });
  const isSingletonProduct = Boolean(selectedProduct?.isSingleton);

  const productProjects = useMemo(() => {
    if (!rawProjects || !selectedProduct || selectedProduct.isSingleton) return [];
    return rawProjects.filter((p) => p.type === selectedProduct.type);
  }, [rawProjects, selectedProduct]);

  const selectedProjects = useWatch({ control, name: "projects" }) ?? [];
  const singleSelectedProjectId = getSingleSelectedProjectId(selectedProjects);

  useEffect(() => {
    setValue("projectRole", DEFAULT_PROJECT_ROLE);
  }, [singleSelectedProjectId, selectedProduct?.type, setValue]);

  return (
    <>
      <Controller
        control={control}
        name="product"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="assign-users-product" className="flex items-center gap-1.5">
              Assign users to a product
              <span className="text-xs font-normal text-muted">(optional)</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Info className="size-3 text-muted" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Select which product to grant the users access to.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FilterableSelect
              inputId="assign-users-product"
              isClearable
              value={value ?? null}
              isLoading={isProjectsLoading}
              onChange={(option) => {
                onChange(option);
                setValue("projects", []);
                setValue("projectRole", DEFAULT_PROJECT_ROLE);
              }}
              getOptionLabel={(product) => product.name}
              getOptionValue={(product) => product.type}
              options={availableProducts}
              placeholder="Select a product..."
              isError={Boolean(error?.message)}
              components={{ Option: ProductOption, SingleValue: ProductSingleValue }}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />

      {selectedProduct && !isSingletonProduct && (
        <Controller
          control={control}
          name="projects"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor="assign-users-projects" className="flex items-center gap-1.5">
                Assign users to projects
                <span className="text-xs font-normal text-muted">(optional)</span>
              </FieldLabel>
              <FilterableSelect
                inputId="assign-users-projects"
                isMulti
                value={value}
                onChange={onChange}
                isLoading={isProjectsLoading}
                getOptionLabel={(project) => project.name}
                getOptionValue={(project) => project.id}
                options={productProjects}
                placeholder="Select projects..."
                isError={Boolean(error?.message)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
      )}

      {selectedProduct && (
        <Controller
          control={control}
          name="projectRole"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor="assign-users-project-role" className="flex items-center gap-1.5">
                {isSingletonProduct ? "Product role" : "Project role"}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Info className="size-3 text-muted" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md whitespace-pre-line">
                    {isSingletonProduct ? (
                      "Select which role to assign to the users for this product."
                    ) : (
                      <>
                        Select which role to assign to the users in the selected projects.
                        <br />
                        <br />
                        When multiple projects are selected, only built-in roles are available for
                        selection.
                        <br />
                        <br />
                        You can assign users to additional projects after they&apos;ve been invited.
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <ProjectRoleSelect
                inputId="assign-users-project-role"
                value={value}
                onChange={onChange}
                isError={Boolean(error)}
                selectedProjects={selectedProjects}
                fixedRoles={selectedProduct?.roles}
                productType={selectedProduct?.type}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
        />
      )}
    </>
  );
};
