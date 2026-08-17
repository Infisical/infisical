import { RoleOption } from "@app/components/roles";
import { FilterableSelect } from "@app/components/v3";
import { useGetProjectRoles } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

export type TProjectRoleOption = {
  slug: string;
  name: string;
  description?: string;
};

export const DEFAULT_PROJECT_ROLE: TProjectRoleOption = { slug: "member", name: "Member" };

// Mirrors the backend's getPredefinedRoles: type-tagged roles are only valid for
// projects of that type.
const PREDEFINED_PROJECT_ROLES: (TProjectRoleOption & { type?: ProjectType })[] = [
  { slug: "admin", name: "Admin", description: "Full administrative access over a project" },
  { slug: "member", name: "Member", description: "Limited read/write role in a project" },
  {
    slug: "cryptographic-operator",
    name: "Cryptographic Operator",
    description: "Perform cryptographic operations, such as encryption and signing, in a project",
    type: ProjectType.KMS
  },
  { slug: "viewer", name: "Viewer", description: "Only read role in a project" },
  { slug: "no-access", name: "No Access", description: "No access to any resources in the project" }
];

const getBuiltInProjectRoles = (productType?: ProjectType) =>
  PREDEFINED_PROJECT_ROLES.filter((role) => !role.type || role.type === productType);

export const CERT_MANAGER_ROLES = [
  {
    slug: "admin",
    name: "Admin",
    description: "Full administrative access over Certificate Manager"
  },
  {
    slug: "member",
    name: "Member",
    description: "Access scoped to the Applications and Code Signers they've been added to"
  }
];

export const PAM_ROLES = [
  {
    slug: "admin",
    name: "Admin",
    description: "Full administrative access over Privileged Access Manager"
  },
  {
    slug: "member",
    name: "Member",
    description: "Access scoped to the folders and accounts they've been added to"
  }
];

export const getSingleSelectedProjectId = (selectedProjects: { id: string }[]) =>
  selectedProjects.length === 1 ? selectedProjects[0].id : undefined;

type Props = {
  inputId?: string;
  value?: TProjectRoleOption | null;
  onChange: (value: unknown) => void;
  isError?: boolean;
  selectedProjects: { id: string }[];
  fixedRoles?: TProjectRoleOption[];
  productType?: ProjectType;
};

// Shared by AddOrgMemberModal and AddSubOrgMemberModal: with fixed roles (singleton
// products) use those; with exactly one project selected offer that project's real
// roles (custom + type-filtered predefined); otherwise the built-in roles valid for
// the selected product type.
export const ProjectRoleSelect = ({
  inputId,
  value,
  onChange,
  isError,
  selectedProjects,
  fixedRoles,
  productType
}: Props) => {
  const singleSelectedProjectId = getSingleSelectedProjectId(selectedProjects);
  const { data: fetchedProjectRoles, isPending: isProjectRolesLoading } = useGetProjectRoles(
    singleSelectedProjectId ?? ""
  );

  const projectRoles: TProjectRoleOption[] =
    fixedRoles ??
    (fetchedProjectRoles?.length
      ? fetchedProjectRoles.map((role) => ({
          slug: role.slug,
          name: role.name,
          description: role.description ?? undefined
        }))
      : getBuiltInProjectRoles(productType));

  return (
    <FilterableSelect
      inputId={inputId}
      isDisabled={!fixedRoles && selectedProjects.length === 0}
      isLoading={Boolean(singleSelectedProjectId) && isProjectRolesLoading}
      value={value}
      onChange={onChange}
      options={projectRoles}
      getOptionValue={(option) => option.slug}
      getOptionLabel={(option) => option.name}
      placeholder="Select role..."
      isError={isError}
      components={{ Option: RoleOption }}
    />
  );
};
