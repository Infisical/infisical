import { useMutation, useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { OrderByDirection } from "@app/hooks/api/generic/types";

import { TGroupOrgMembership } from "../groups/types";
import { getAuthToken } from "../reactQuery";
import { TOrgRole } from "../roles/types";
import { IntegrationAuth } from "../types";
import {
  Organization,
  OrgIdentityOrderBy,
  TListOrgIdentitiesDTO,
  TOrgIdentitiesList,
  TOrgProductStats,
  UpdateOrgDTO
} from "./types";

export type TOrgWithSubOrgs = Organization & {
  userJoinedAt?: string | null;
  subOrganizations: { id: string; name: string; slug: string; userJoinedAt?: string | null }[];
};

export const organizationKeys = {
  getUserOrganizations: ["organization"] as const,
  getUserOrganizationsWithSubOrgs: ["organization", "with-sub-orgs"] as const,
  getOrgIdentityMemberships: (orgId: string) =>
    [{ orgId }, "organization-identity-memberships"] as const,
  // allows invalidation using above key without knowing params
  getOrgIdentityMembershipsWithParams: ({
    organizationId: orgId,
    ...params
  }: TListOrgIdentitiesDTO) =>
    [...organizationKeys.getOrgIdentityMemberships(orgId), params] as const,
  getOrgGroups: (orgId: string) => [{ orgId }, "organization-groups"] as const,
  getOrgGroupsWithParams: (
    orgId: string,
    params: {
      offset?: number;
      limit?: number;
      search?: string;
      roles?: string[];
      orderBy?: string;
      orderDirection?: string;
    }
  ) => [...organizationKeys.getOrgGroups(orgId), params] as const,
  getOrgIntegrationAuths: (orgId: string) => [{ orgId }, "integration-auths"] as const,
  getOrgById: (orgId: string) => ["organization", { orgId }],
  getAvailableIdentities: () => ["available-identities"],
  getAvailableUsers: () => ["available-users"],
  getOrgProductStats: (orgId: string) => [{ orgId }, "organization-product-stats"] as const
};

export const fetchOrganizations = async () => {
  const {
    data: { organizations }
  } = await apiRequest.get<{ organizations: Organization[] }>("/api/v1/organization");
  return organizations;
};

export const useGetOrganizations = () => {
  return useQuery({
    queryKey: organizationKeys.getUserOrganizations,
    queryFn: async () => {
      return fetchOrganizations();
    }
  });
};

export const fetchOrganizationsWithSubOrgs = async () => {
  // prioritize auth token
  const authToken = getAuthToken();

  const {
    data: { organizations }
  } = await apiRequest.get<{ organizations: TOrgWithSubOrgs[] }>(
    "/api/v1/organization/accessible-with-sub-orgs",
    {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined
    }
  );
  return organizations;
};

export const useGetOrganizationsWithSubOrgs = () => {
  return useQuery({
    queryKey: organizationKeys.getUserOrganizationsWithSubOrgs,
    queryFn: fetchOrganizationsWithSubOrgs
  });
};

export const fetchOrganizationById = async (id: string) => {
  const {
    data: { organization }
  } = await apiRequest.get<{
    organization: Organization;
  }>(`/api/v1/organization/${id}`);
  return organization;
};

export const useGetOrganizationById = (id: string, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: organizationKeys.getOrgById(id),
    queryFn: async () => {
      return fetchOrganizationById(id);
    },
    enabled: options?.enabled ?? true
  });
};

export const useCreateOrg = (options: { invalidate: boolean } = { invalidate: true }) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const {
        data: { organization }
      } = await apiRequest.post("/api/v2/organizations", {
        name
      });

      return organization;
    },
    onSuccess: () => {
      if (options?.invalidate) {
        queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
      }
    }
  });
};

export const useUpdateOrg = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, UpdateOrgDTO>({
    mutationFn: ({
      name,
      authEnforced,
      googleSsoAuthEnforced,
      scimEnabled,
      slug,
      orgId,
      defaultMembershipRoleSlug,
      enforceMfa,
      selectedMfaMethod,
      allowSecretSharingOutsideOrganization,
      bypassOrgAuthEnabled,
      userTokenExpiration,
      secretsProductEnabled,
      pkiProductEnabled,
      kmsProductEnabled,
      scannerProductEnabled,
      shareSecretsProductEnabled,
      maxSharedSecretLifetime,
      maxSharedSecretViewLimit,
      blockDuplicateSecretSyncDestinations,
      allowCrossProjectSecretSharing,
      secretShareBrandConfig
    }) => {
      return apiRequest.patch(`/api/v1/organization/${orgId}`, {
        name,
        authEnforced,
        googleSsoAuthEnforced,
        scimEnabled,
        slug,
        defaultMembershipRoleSlug,
        enforceMfa,
        selectedMfaMethod,
        allowSecretSharingOutsideOrganization,
        bypassOrgAuthEnabled,
        userTokenExpiration,
        secretsProductEnabled,
        pkiProductEnabled,
        kmsProductEnabled,
        scannerProductEnabled,
        shareSecretsProductEnabled,
        maxSharedSecretLifetime,
        maxSharedSecretViewLimit,
        blockDuplicateSecretSyncDestinations,
        allowCrossProjectSecretSharing,
        secretShareBrandConfig
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });

      if (variables.allowCrossProjectSecretSharing !== undefined) {
        const secretLabels = new Set([
          "secrets",
          "secrets-import-sec",
          "imported-folders-all-envs",
          "secret-reference-tree",
          "secret-references"
        ]);
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey.length >= 2 &&
            (secretLabels.has(query.queryKey[0] as string) ||
              secretLabels.has(query.queryKey[1] as string) ||
              query.queryKey[0] === "dashboard")
        });
      }
    }
  });
};

export const useUpgradePrivilegeSystem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      return apiRequest.post("/api/v2/organizations/privilege-system-upgrade");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
    }
  });
};

export const useGetIdentityMembershipOrgs = (
  {
    organizationId,
    offset = 0,
    limit = 100,
    orderBy = OrgIdentityOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search = ""
  }: TListOrgIdentitiesDTO,
  options?: Omit<
    UseQueryOptions<
      TOrgIdentitiesList,
      unknown,
      TOrgIdentitiesList,
      ReturnType<typeof organizationKeys.getOrgIdentityMembershipsWithParams>
    >,
    "queryKey" | "queryFn"
  >
) => {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    orderBy: String(orderBy),
    orderDirection: String(orderDirection),
    search: String(search)
  });
  return useQuery({
    queryKey: organizationKeys.getOrgIdentityMembershipsWithParams({
      organizationId,
      offset,
      limit,
      orderBy,
      orderDirection,
      search
    }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOrgIdentitiesList>(
        `/api/v2/organizations/${organizationId}/identity-memberships`,
        { params }
      );

      return data;
    },
    enabled: true,
    ...options
  });
};

export const useDeleteOrgById = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId }: { organizationId: string }) => {
      const {
        data: { organization }
      } = await apiRequest.delete<{ organization: Organization }>(
        `/api/v2/organizations/${organizationId}`
      );
      return organization;
    },
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
    }
  });
};

type OrgGroupMembershipResponse = {
  groupMemberships: Array<{
    id: string;
    groupId: string;
    group: { id: string; name: string; slug: string; orgId?: string };
    roles: Array<{
      id: string;
      role: string;
      customRoleId?: string | null;
      customRoleName?: string | null;
      customRoleSlug?: string | null;
      permissions?: unknown;
      description?: string | null;
    }>;
    createdAt: string;
    updatedAt: string;
  }>;
  totalCount: number;
};

function mapOrgMembershipToGroup(
  m: OrgGroupMembershipResponse["groupMemberships"][0]
): TGroupOrgMembership {
  const firstRole = m.roles[0];
  return {
    id: m.group.id,
    name: m.group.name,
    slug: m.group.slug,
    orgId: m.group.orgId ?? "",
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    role: firstRole?.role ?? "member",
    roleId: firstRole?.id ?? "",
    ...(firstRole?.role === "custom" &&
      firstRole.customRoleSlug && {
        customRole: {
          id: firstRole.customRoleId ?? "",
          name: firstRole.customRoleName ?? "",
          slug: firstRole.customRoleSlug,
          orgId: "",
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          permissions: (firstRole.permissions as TOrgRole["permissions"]) ?? [],
          description: firstRole.description ?? undefined
        } as TOrgRole
      })
  };
}

export const useGetOrganizationGroups = (organizationId: string) => {
  return useQuery({
    queryKey: organizationKeys.getOrgGroups(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const {
        data: { groupMemberships }
      } = await apiRequest.get<OrgGroupMembershipResponse>(
        "/api/v1/organizations/memberships/groups",
        { params: { limit: 100 } }
      );

      return groupMemberships.map(mapOrgMembershipToGroup);
    }
  });
};

export const useSearchOrganizationGroups = ({
  organizationId,
  offset,
  limit,
  search,
  roles,
  orderBy,
  orderDirection
}: {
  organizationId: string;
  offset?: number;
  limit?: number;
  search?: string;
  roles?: string[];
  orderBy?: string;
  orderDirection?: string;
}) => {
  return useQuery({
    queryKey: organizationKeys.getOrgGroupsWithParams(organizationId, {
      offset,
      limit,
      search,
      roles,
      orderBy,
      orderDirection
    }),
    enabled: Boolean(organizationId),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const {
        data: { groupMemberships, totalCount }
      } = await apiRequest.get<OrgGroupMembershipResponse>(
        "/api/v1/organizations/memberships/groups",
        {
          params: {
            limit,
            offset,
            search: search || undefined,
            roles: roles?.length ? roles : undefined,
            orderBy,
            orderDirection
          }
        }
      );
      return { groups: groupMemberships.map(mapOrgMembershipToGroup), totalCount };
    }
  });
};

export const useGetOrgIntegrationAuths = <TData = IntegrationAuth[],>(
  organizationId: string,
  select?: (data: IntegrationAuth[]) => TData
) => {
  return useQuery({
    queryKey: organizationKeys.getOrgIntegrationAuths(organizationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ authorizations: IntegrationAuth[] }>(
        `/api/v1/organization/${organizationId}/integration-authorizations`
      );

      return data.authorizations;
    },
    enabled: Boolean(organizationId),
    select
  });
};

export const useGetAvailableOrgUsers = (enabled = true) =>
  useQuery({
    queryKey: organizationKeys.getAvailableUsers(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        users: {
          username: string;
          id: string;
          email?: string | null;
          firstName: string;
          lastName: string;
        }[];
      }>("/api/v1/organization/users/available");

      return data.users;
    },
    enabled
  });

export const useGetOrgProductStats = (orgId: string) =>
  useQuery({
    queryKey: organizationKeys.getOrgProductStats(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOrgProductStats>("/api/v1/organization/product-stats");
      return data;
    },
    enabled: Boolean(orgId)
  });
