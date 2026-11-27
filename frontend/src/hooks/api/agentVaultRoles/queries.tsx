import { useMemo } from "react";
import { QueryClient, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProjectPermission
} from "@app/context";
import { AGENT_VAULT_PRODUCT_ROLE_OPTIONS, isCustomProjectRole } from "@app/helpers/roles";
import { agentVaultKeys } from "@app/hooks/api/agentVault/queries";
import {
  TAgentVaultAccessBundleListItem,
  TAgentVaultProductMember,
  TAgentVaultProjectService,
  TAgentVaultSkill
} from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useGetProjectRoles } from "@app/hooks/api/roles/queries";
import { TProjectRole } from "@app/hooks/api/roles/types";

export type TAgentVaultRoleOption = {
  slug: string;
  name: string;
  description: string;
  isCustom: boolean;
};

const BUILT_IN_ROLE_OPTIONS: TAgentVaultRoleOption[] = AGENT_VAULT_PRODUCT_ROLE_OPTIONS.map(
  ({ value, label, description }) => ({ slug: value, name: label, description, isCustom: false })
);

// Custom roles are offered beside Admin and No Access wherever roles are picked. Without Read on roles only the
// built-in ones are offered, and a custom role shows by its slug.
export const useAgentVaultRoleOptions = (projectId: string) => {
  const { permission } = useProjectPermission();
  const canReadRoles = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  const { data: projectRoles, isPending: isRolesPending } = useGetProjectRoles(
    canReadRoles ? projectId : "",
    ProjectType.AgentVault
  );
  const isPending = canReadRoles && isRolesPending;

  return useMemo(() => {
    const custom: TAgentVaultRoleOption[] = (projectRoles ?? [])
      .filter((role) => isCustomProjectRole(role.slug))
      .map((role) => ({
        slug: role.slug,
        name: role.name,
        description: role.description ?? "",
        isCustom: true
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const bySlug = new Map(
      [...BUILT_IN_ROLE_OPTIONS, ...custom].map((option) => [option.slug, option])
    );

    return {
      builtIn: BUILT_IN_ROLE_OPTIONS,
      custom,
      isPending,
      findRole: (slug: string) => bySlug.get(slug)
    };
  }, [projectRoles, isPending]);
};

// What a role change can move: which bundles, services and skills each holder can use, who holds each role a bundle
// lists, and the members' role badges.
export const invalidateAgentVaultRoleDependents = (
  queryClient: QueryClient,
  orgId: string,
  projectId: string
) => {
  queryClient.invalidateQueries({ queryKey: agentVaultKeys.accessBundles(orgId, projectId) });
  queryClient.invalidateQueries({ queryKey: agentVaultKeys.services(orgId, projectId) });
  queryClient.invalidateQueries({ queryKey: agentVaultKeys.skills(orgId, projectId) });
  queryClient.invalidateQueries({ queryKey: agentVaultKeys.members(orgId, projectId) });
};

const PAGE_SIZE = 100;
// Catalogs past this many rows are cut short, and a policy row naming one further down shows by its ID.
const MAX_CATALOG_ROWS = 1000;

type TPage<T> = { items: T[]; totalCount: number };

const fetchAllPages = async <T,>(
  fetchPage: (offset: number) => Promise<TPage<T>>,
  maxRows: number,
  offset = 0,
  collected: T[] = []
): Promise<TPage<T>> => {
  const page = await fetchPage(offset);
  const items = [...collected, ...page.items];
  const isLast =
    page.items.length < PAGE_SIZE || items.length >= page.totalCount || items.length >= maxRows;
  if (isLast) return { items, totalCount: page.totalCount };
  return fetchAllPages(fetchPage, maxRows, offset + PAGE_SIZE, items);
};

// Every access bundle the caller can see, so policy rows can show a name for the ids they hold. Nested under
// accessBundles() so a bundle change refreshes it.
export const useAgentVaultAccessBundleCatalog = (
  projectId: string,
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: [...agentVaultKeys.accessBundles(currentOrg.id, projectId), "catalog"],
    queryFn: () =>
      fetchAllPages(async (offset) => {
        const { data } = await apiRequest.get<{
          accessBundles: TAgentVaultAccessBundleListItem[];
          totalCount: number;
        }>("/api/v1/agent-vault/access-bundles", {
          params: { projectId, limit: PAGE_SIZE, offset }
        });
        return { items: data.accessBundles, totalCount: data.totalCount };
      }, MAX_CATALOG_ROWS),
    enabled: enabled && Boolean(projectId)
  });
};

// Every service the caller can see, so policy rows can show a name, type and hosts for the ids they hold. Nested under
// services() so a service change refreshes it.
export const useAgentVaultServiceCatalog = (
  projectId: string,
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: [...agentVaultKeys.services(currentOrg.id, projectId), "catalog"],
    queryFn: () =>
      fetchAllPages(async (offset) => {
        const { data } = await apiRequest.get<{
          services: TAgentVaultProjectService[];
          totalCount: number;
        }>("/api/v1/agent-vault/services", {
          params: { projectId, limit: PAGE_SIZE, offset, orderBy: "name" }
        });
        return { items: data.services, totalCount: data.totalCount };
      }, MAX_CATALOG_ROWS),
    enabled: enabled && Boolean(projectId)
  });
};

// Skills are listed rather than read one by one, because reading a skill by id records an audit event.
export const useAgentVaultSkillCatalog = (
  projectId: string,
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: [...agentVaultKeys.skillLists(currentOrg.id, projectId), "catalog"],
    queryFn: () =>
      fetchAllPages(async (offset) => {
        const { data } = await apiRequest.get<{ skills: TAgentVaultSkill[]; totalCount: number }>(
          "/api/v1/agent-vault/skills",
          { params: { projectId, limit: PAGE_SIZE, offset } }
        );
        return { items: data.skills, totalCount: data.totalCount };
      }, MAX_CATALOG_ROWS),
    enabled: enabled && Boolean(projectId)
  });
};

// Every member the caller can read, for counting and listing who holds a role. Read to the end, unlike the catalogs,
// since a count cut short would show a role with holders as unassigned. Nested under members() so adding, removing or
// changing the roles of a member refreshes it.
export const useListAllAgentVaultMembers = (
  projectId: string,
  { enabled = true }: { enabled?: boolean } = {}
) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: [...agentVaultKeys.members(currentOrg.id, projectId), "all"],
    queryFn: () =>
      fetchAllPages(async (offset) => {
        const { data } = await apiRequest.get<{
          members: TAgentVaultProductMember[];
          totalCount: number;
        }>("/api/v1/agent-vault/members", {
          params: { projectId, limit: PAGE_SIZE, offset }
        });
        return { items: data.members, totalCount: data.totalCount };
      }, Infinity),
    enabled: enabled && Boolean(projectId)
  });
};

export const fetchAgentVaultRoleBySlug = async (projectId: string, roleSlug: string) => {
  const { data } = await apiRequest.get<{ role: TProjectRole }>(
    `/api/v1/projects/${projectId}/roles/slug/${roleSlug}`
  );
  return data.role;
};
