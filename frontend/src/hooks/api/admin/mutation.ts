import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { Organization } from "@app/hooks/api/organization/types";

import { organizationKeys } from "../organization/queries";
import { User } from "../users/types";
import { adminQueryKeys, adminStandaloneKeys } from "./queries";
import {
  RootKeyEncryptionStrategy,
  TCreateAdminUserDTO,
  TCreateOrganizationDTO,
  TInvalidateCacheDTO,
  TResendOrgInviteDTO,
  TServerConfig,
  TUpdateServerConfigDTO,
  TUsageReportResponse
} from "./types";

export const useCreateAdminUser = () => {
  const queryClient = useQueryClient();

  return useMutation<
    { user: User; token: string; organization: { id: string } },
    object,
    TCreateAdminUserDTO
  >({
    mutationFn: async (opt) => {
      const { data } = await apiRequest.post("/api/v1/admin/signup", opt);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.serverConfig() });
    }
  });
};

export const useUpdateServerConfig = () => {
  const queryClient = useQueryClient();

  return useMutation<TServerConfig, object, TUpdateServerConfigDTO>({
    mutationFn: async (opt) => {
      const { data } = await apiRequest.patch<{ config: TServerConfig }>(
        "/api/v1/admin/config",
        opt
      );
      return data.config;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(adminQueryKeys.serverConfig(), data);
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.getAdminIntegrationsConfig() });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.serverConfig() });
      queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
    }
  });
};

export const useAdminDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest.delete(`/api/v1/admin/user-management/users/${userId}`);

      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [adminStandaloneKeys.getUsers]
      });
      queryClient.invalidateQueries({ queryKey: adminStandaloneKeys.getOrganizations });
    }
  });
};

export const useAdminBulkDeleteUsers = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      await apiRequest.delete("/api/v1/admin/user-management/users", {
        data: { userIds }
      });

      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [adminStandaloneKeys.getUsers]
      });
      queryClient.invalidateQueries({ queryKey: adminStandaloneKeys.getOrganizations });
    }
  });
};

export const useAdminDeleteOrganizationMembership = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, { organizationId: string; membershipId: string }>({
    mutationFn: async ({ organizationId, membershipId }) => {
      await apiRequest.delete(
        `/api/v1/admin/organization-management/organizations/${organizationId}/memberships/${membershipId}`
      );

      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [adminStandaloneKeys.getOrganizations]
      });
    }
  });
};

export const useAdminDeleteOrganization = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string) => {
      await apiRequest.delete(
        `/api/v1/admin/organization-management/organizations/${organizationId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [adminStandaloneKeys.getOrganizations]
      });
    }
  });
};

export const useAdminRemoveIdentitySuperAdminAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (identityId: string) => {
      await apiRequest.delete(
        `/api/v1/admin/identity-management/identities/${identityId}/super-admin-access`
      );

      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [adminStandaloneKeys.getIdentities]
      });
    }
  });
};

export const useRemoveUserServerAdminAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest.delete(`/api/v1/admin/user-management/users/${userId}/admin-access`);

      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [adminStandaloneKeys.getUsers]
      });
    }
  });
};

export const useAdminGrantServerAdminAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest.patch(`/api/v1/admin/user-management/users/${userId}/admin-access`);
      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [adminStandaloneKeys.getUsers]
      });
    }
  });
};

export const useUpdateServerEncryptionStrategy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (strategy: RootKeyEncryptionStrategy) => {
      await apiRequest.patch("/api/v1/admin/encryption-strategies", { strategy });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.getServerEncryptionStrategies() });
    }
  });
};

export const useInvalidateCache = () => {
  const queryClient = useQueryClient();
  return useMutation<void, object, TInvalidateCacheDTO>({
    mutationFn: async (dto) => {
      await apiRequest.post("/api/v1/admin/invalidate-cache", dto);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.getInvalidateCache() });
    }
  });
};

export const useServerAdminCreateOrganization = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (opt: TCreateOrganizationDTO) => {
      const { data } = await apiRequest.post<{ organization: Organization }>(
        "/api/v1/admin/organization-management/organizations",
        opt
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.getOrganizations() });
    }
  });
};

export const useServerAdminResendOrgInvite = () => {
  return useMutation({
    mutationFn: async ({ organizationId, membershipId }: TResendOrgInviteDTO) => {
      await apiRequest.post(
        `/api/v1/admin/organization-management/organizations/${organizationId}/memberships/${membershipId}/resend-invite`,
        {}
      );
    }
  });
};

export const useServerAdminAccessOrg = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orgId: string) => {
      const { data } = await apiRequest.post(
        `/api/v1/admin/organization-management/organizations/${orgId}/access`,
        {}
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.getUserOrganizations });
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.getOrganizations() });
    }
  });
};

export const useGenerateUsageReport = () => {
  return useMutation<TUsageReportResponse, object, void>({
    mutationFn: async () => {
      const { data } = await apiRequest.post<TUsageReportResponse>(
        "/api/v1/admin/usage-report/generate",
        {}
      );
      return data;
    }
  });
};
