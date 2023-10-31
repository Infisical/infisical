import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  BillingDetails,
  Invoice,
  License,
  Organization,
  OrgPlanTable,
  PlanBillingInfo,
  PmtMethod,
  ProductsTable,
  RenameOrgDTO,
  TaxID
} from "./types";

const organizationKeys = {
  getUserOrganizations: ["organization"] as const,
  getOrgPlanBillingInfo: (orgId: string) => [{ orgId }, "organization-plan-billing"] as const,
  getOrgPlanTable: (orgId: string) => [{ orgId }, "organization-plan-table"] as const,
  getOrgPlansTable: (orgId: string, billingCycle: "monthly" | "yearly") =>
    [{ orgId, billingCycle }, "organization-plans-table"] as const,
  getOrgBillingDetails: (orgId: string) => [{ orgId }, "organization-billing-details"] as const,
  getOrgPmtMethods: (orgId: string) => [{ orgId }, "organization-pmt-methods"] as const,
  getOrgTaxIds: (orgId: string) => [{ orgId }, "organization-tax-ids"] as const,
  getOrgInvoices: (orgId: string) => [{ orgId }, "organization-invoices"] as const,
  getOrgLicenses: (orgId: string) => [{ orgId }, "organization-licenses"] as const
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

export const useCreateOrg = () => {
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
      queryClient.invalidateQueries(organizationKeys.getUserOrganizations);
    }
  });
};

export const useRenameOrg = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, RenameOrgDTO>({
    mutationFn: ({ newOrgName, orgId }) => {
      return apiRequest.patch(`/api/v1/organization/${orgId}/name`, { name: newOrgName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(organizationKeys.getUserOrganizations);
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
      queryClient.invalidateQueries(organizationKeys.getOrgBillingDetails(dto.organizationId));
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
      queryClient.invalidateQueries(organizationKeys.getOrgPmtMethods(dto.organizationId));
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
      queryClient.invalidateQueries(organizationKeys.getOrgPmtMethods(dto.organizationId));
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
      queryClient.invalidateQueries(organizationKeys.getOrgTaxIds(dto.organizationId));
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
      queryClient.invalidateQueries(organizationKeys.getOrgTaxIds(dto.organizationId));
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
        `/api/v1/organization/${organizationId}/customer-portal-session`
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
      queryClient.invalidateQueries(organizationKeys.getUserOrganizations);
      queryClient.invalidateQueries(organizationKeys.getOrgPlanBillingInfo(dto.organizationId));
      queryClient.invalidateQueries(organizationKeys.getOrgPlanTable(dto.organizationId));
      queryClient.invalidateQueries(
        organizationKeys.getOrgPlansTable(dto.organizationId, "monthly")
      ); // You might need to invalidate for 'yearly' as well.
      queryClient.invalidateQueries(
        organizationKeys.getOrgPlansTable(dto.organizationId, "yearly")
      );
      queryClient.invalidateQueries(organizationKeys.getOrgBillingDetails(dto.organizationId));
      queryClient.invalidateQueries(organizationKeys.getOrgPmtMethods(dto.organizationId));
      queryClient.invalidateQueries(organizationKeys.getOrgTaxIds(dto.organizationId));
      queryClient.invalidateQueries(organizationKeys.getOrgInvoices(dto.organizationId));
      queryClient.invalidateQueries(organizationKeys.getOrgLicenses(dto.organizationId));
    }
  });
};
