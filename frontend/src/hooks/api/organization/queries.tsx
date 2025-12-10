import { useMutation, useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { OrderByDirection } from "@app/hooks/api/generic/types";

import { TGroupOrgMembership } from "../groups/types";
import { IntegrationAuth, SubscriptionProducts } from "../types";
import {
  BillingDetails,
  Invoice,
  License,
  Organization,
  OrgIdentityOrderBy,
  OrgPlanTable,
  PlanBillingInfo,
  PmtMethod,
  ProductsTable,
  TaxID,
  TListOrgIdentitiesDTO,
  TOrgIdentitiesList,
  UpdateOrgDTO
} from "./types";

export const organizationKeys = {
  getUserOrganizations: ["organization"] as const,
  getOrgPlanBillingInfo: (orgId: string) => [{ orgId }, "organization-plan-billing"] as const,
  getOrgPlanTable: (orgId: string) => ["organization-plan-table", { orgId }] as const,
  getOrgPlansTable: (orgId: string, billingCycle: "monthly" | "yearly") =>
    ["organization-plans-table", { orgId, billingCycle }] as const,
  getOrgBillingDetails: (orgId: string) => [{ orgId }, "organization-billing-details"] as const,
  getOrgPmtMethods: (orgId: string) => [{ orgId }, "organization-pmt-methods"] as const,
  getOrgTaxIds: (orgId: string) => [{ orgId }, "organization-tax-ids"] as const,
  getOrgInvoices: (orgId: string) => [{ orgId }, "organization-invoices"] as const,
  getOrgLicenses: (orgId: string) => [{ orgId }, "organization-licenses"] as const,
  getOrgIdentityMemberships: (orgId: string) =>
    [{ orgId }, "organization-identity-memberships"] as const,
  // allows invalidation using above key without knowing params
  getOrgIdentityMembershipsWithParams: ({
    organizationId: orgId,
    ...params
  }: TListOrgIdentitiesDTO) =>
    [...organizationKeys.getOrgIdentityMemberships(orgId), params] as const,
  getOrgGroups: (orgId: string) => [{ orgId }, "organization-groups"] as const,
  getOrgIntegrationAuths: (orgId: string) => [{ orgId }, "integration-auths"] as const,
  getOrgById: (orgId: string) => ["organization", { orgId }],
  getAvailableIdentities: () => ["available-identities"],
  getAvailableUsers: () => ["available-users"]
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

export const fetchOrganizationById = async (id: string) => {
  const {
    data: { organization }
  } = await apiRequest.get<{
    organization: Organization;
  }>(`/api/v1/organization/${id}`);
  return organization;
};

export const useGetOrganizationById = (id: string) => {
  return useQuery({
    queryKey: organizationKeys.getOrgById(id),
    queryFn: async () => {
      return fetchOrganizationById(id);
    }
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
      sshProductEnabled,
      scannerProductEnabled,
      shareSecretsProductEnabled,
      maxSharedSecretLifetime,
      maxSharedSecretViewLimit,
      blockDuplicateSecretSyncDestinations
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
        sshProductEnabled,
        scannerProductEnabled,
        shareSecretsProductEnabled,
        maxSharedSecretLifetime,
        maxSharedSecretViewLimit,
        blockDuplicateSecretSyncDestinations
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
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

export const useGetOrgTrialUrl = () => {
  return useMutation({
    mutationFn: async ({ orgId, success_url }: { orgId: string; success_url: string }) => {
      const {
        data: { url }
      } = await apiRequest.post(`/api/v1/organizations/${orgId}/session/trial`, {
        success_url
      });

      return url;
    }
  });
};

export const useGetOrgPlanBillingInfo = (organizationId: string) => {
  return useQuery({
    queryKey: organizationKeys.getOrgPlanBillingInfo(organizationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<PlanBillingInfo>(
        `/api/v1/organizations/${organizationId}/plan/billing`
      );

      return data;
    },
    enabled: true
  });
};

export const useGetOrgPlanTable = (organizationId: string) => {
  return useQuery({
    queryKey: organizationKeys.getOrgPlanTable(organizationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<OrgPlanTable>(
        `/api/v1/organizations/${organizationId}/plan/table`
      );

      return data;
    },
    enabled: true
  });
};

export const useGetOrgPlansTable = ({
  organizationId,
  billingCycle
}: {
  organizationId: string;
  billingCycle: "monthly" | "yearly";
}) => {
  return useQuery({
    queryKey: organizationKeys.getOrgPlansTable(organizationId, billingCycle),
    queryFn: async () => {
      const { data } = await apiRequest.get<ProductsTable>(
        `/api/v1/organizations/${organizationId}/plans/table?billingCycle=${billingCycle}`
      );

      return data;
    },
    enabled: true
  });
};

export const useGetOrgBillingDetails = (organizationId: string) => {
  return useQuery({
    queryKey: organizationKeys.getOrgBillingDetails(organizationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<BillingDetails>(
        `/api/v1/organizations/${organizationId}/billing-details`
      );

      return data;
    },
    enabled: true
  });
};

export const useUpdateOrgBillingDetails = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      name,
      email
    }: {
      organizationId: string;
      name?: string;
      email?: string;
    }) => {
      const { data } = await apiRequest.patch(
        `/api/v1/organizations/${organizationId}/billing-details`,
        {
          name,
          email
        }
      );

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgBillingDetails(dto.organizationId)
      });
    }
  });
};

export const useUpgradeProductToPro = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ product }: { product: SubscriptionProducts }) => {
      const { data } = await apiRequest.post(
        `/api/v1/organizations/upgrade-product-to-pro/${product}`
      );

      return data;
    },
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: ["organization-plan-table"]
      });
      queryClient.invalidateQueries({
        queryKey: ["plan"]
      });
    }
  });
};

export const useGetOrgPmtMethods = (organizationId: string) => {
  return useQuery({
    queryKey: organizationKeys.getOrgPmtMethods(organizationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<PmtMethod[]>(
        `/api/v1/organizations/${organizationId}/billing-details/payment-methods`
      );

      return data;
    },
    enabled: true
  });
};

export const useAddOrgPmtMethod = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      organizationId,
      success_url,
      cancel_url
    }: {
      organizationId: string;
      success_url: string;
      cancel_url: string;
    }) => {
      const {
        data: { url }
      } = await apiRequest.post(
        `/api/v1/organizations/${organizationId}/billing-details/payment-methods`,
        {
          success_url,
          cancel_url
        }
      );

      return url;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgPmtMethods(dto.organizationId)
      });
    }
  });
};

export const useDeleteOrgPmtMethod = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      organizationId,
      pmtMethodId
    }: {
      organizationId: string;
      pmtMethodId: string;
    }) => {
      const { data } = await apiRequest.delete(
        `/api/v1/organizations/${organizationId}/billing-details/payment-methods/${pmtMethodId}`
      );

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgPmtMethods(dto.organizationId)
      });
    }
  });
};

export const useGetOrgTaxIds = (organizationId: string) => {
  return useQuery({
    queryKey: organizationKeys.getOrgTaxIds(organizationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TaxID[]>(
        `/api/v1/organizations/${organizationId}/billing-details/tax-ids`
      );

      return data;
    },
    enabled: true
  });
};

export const useAddOrgTaxId = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      organizationId,
      type,
      value
    }: {
      organizationId: string;
      type: string;
      value: string;
    }) => {
      const { data } = await apiRequest.post(
        `/api/v1/organizations/${organizationId}/billing-details/tax-ids`,
        {
          type,
          value
        }
      );

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgTaxIds(dto.organizationId)
      });
    }
  });
};

export const useDeleteOrgTaxId = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, taxId }: { organizationId: string; taxId: string }) => {
      const { data } = await apiRequest.delete(
        `/api/v1/organizations/${organizationId}/billing-details/tax-ids/${taxId}`
      );

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgTaxIds(dto.organizationId)
      });
    }
  });
};

export const useGetOrgInvoices = (organizationId: string) => {
  return useQuery({
    queryKey: organizationKeys.getOrgInvoices(organizationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<Invoice[]>(
        `/api/v1/organizations/${organizationId}/invoices`
      );

      return data;
    },
    enabled: true
  });
};

export const useCreateCustomerPortalSession = () => {
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { data } = await apiRequest.post(
        `/api/v1/organizations/${organizationId}/customer-portal-session`
      );
      return data;
    }
  });
};

export const useGetOrgLicenses = (organizationId: string) => {
  return useQuery({
    queryKey: organizationKeys.getOrgLicenses(organizationId),
    queryFn: async () => {
      if (organizationId === "") return undefined;

      const { data } = await apiRequest.get<License[]>(
        `/api/v1/organizations/${organizationId}/licenses`
      );

      return data;
    },
    enabled: true
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
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgPlanBillingInfo(dto.organizationId)
      });
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgPlanTable(dto.organizationId)
      });
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgPlansTable(dto.organizationId, "monthly")
      }); // You might need to invalidate for 'yearly' as well.
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgPlansTable(dto.organizationId, "yearly")
      });
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgBillingDetails(dto.organizationId)
      });
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgPmtMethods(dto.organizationId)
      });
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgTaxIds(dto.organizationId)
      });
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgInvoices(dto.organizationId)
      });
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgLicenses(dto.organizationId)
      });
    }
  });
};

export const useGetOrganizationGroups = (organizationId: string) => {
  return useQuery({
    queryKey: organizationKeys.getOrgGroups(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const {
        data: { groups }
      } = await apiRequest.get<{ groups: TGroupOrgMembership[] }>(
        `/api/v1/organization/${organizationId}/groups`
      );

      return groups;
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
        users: { username: string; id: string; firstName: string; lastName: string }[];
      }>("/api/v1/organization/users/available");

      return data.users;
    },
    enabled
  });
