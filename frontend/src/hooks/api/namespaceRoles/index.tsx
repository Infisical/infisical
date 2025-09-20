export {
  useCreateNamespaceRole,
  useUpdateNamespaceRole,
  useDeleteNamespaceRole
} from "./mutations";
export { namespaceRolesQueryKeys } from "./queries";
export type {
  TNamespaceRole,
  TNamespacePermission,
  TCreateNamespaceRoleDTO,
  TUpdateNamespaceRoleDTO,
  TDeleteNamespaceRoleDTO,
  TListNamespaceRolesDTO,
  TGetNamespaceRoleBySlugDTO,
  TGetNamespaceUserPermissionsDTO,
  TNamespaceUserPermissions
} from "./types";