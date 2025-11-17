import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { identitiesKeys } from "@app/hooks/api";
import { CreateIdentityDTO, Identity, UpdateIdentityDTO } from "@app/hooks/api/identities/types";
import { organizationKeys } from "@app/hooks/api/organization/queries";
import { subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";

import { orgIdentityQuery } from "./queries";
import { TDeleteOrgIdentityDTO, TOrgIdentity } from "./types";

// TODO (scott/akhi): eventually move to the new api commented out below; the current ones use old api

export const useCreateOrgIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation<Identity, object, CreateIdentityDTO>({
    mutationFn: async (body) => {
      const {
        data: { identity }
      } = await apiRequest.post("/api/v1/identities/", body);
      return identity;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({
        queryKey: subscriptionQueryKeys.getOrgSubsription(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.searchIdentitiesRoot });
    }
  });
};

export const useUpdateOrgIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation<Identity, object, UpdateIdentityDTO>({
    mutationFn: async ({ identityId, name, role, hasDeleteProtection, metadata }) => {
      const {
        data: { identity }
      } = await apiRequest.patch(`/api/v1/identities/${identityId}`, {
        name,
        role,
        hasDeleteProtection,
        metadata
      });

      return identity;
    },
    onSuccess: (_, { organizationId, identityId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(organizationId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(identityId) });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.searchIdentitiesRoot });
    }
  });
};

// export const useCreateOrgIdentity = () => {
//   const queryClient = useQueryClient();
//   return useMutation({
//     mutationFn: async (dto: TCreateOrgIdentityDTO) => {
//       const { data } = await apiRequest.post<{ identity: TOrgIdentity }>(
//         "/api/v1/organization/identities",
//         dto
//       );
//       return data;
//     },
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: orgIdentityQuery.allKey() });
//       queryClient.invalidateQueries({
//         queryKey: subscriptionQueryKeys.all()
//       });
//     }
//   });
// };
//
// export const useUpdateOrgIdentity = () => {
//   const queryClient = useQueryClient();
//   return useMutation({
//     mutationFn: async ({ identityId, ...updates }: TUpdateOrgIdentityDTO) => {
//       const { data } = await apiRequest.patch<{ identity: TOrgIdentity }>(
//         `/api/v1/organization/identities/${identityId}`,
//         updates
//       );
//       return data;
//     },
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: orgIdentityQuery.allKey() });
//     }
//   });
// };

export const useDeleteOrgIdentity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ identityId }: TDeleteOrgIdentityDTO) => {
      const { data } = await apiRequest.delete<{ identity: TOrgIdentity }>(
        `/api/v1/identities/${identityId}`
      );
      return data;
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.getOrgIdentityMemberships(orgId)
      });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.searchIdentitiesRoot });
      queryClient.invalidateQueries({ queryKey: identitiesKeys.getIdentityById(orgId) });
      queryClient.invalidateQueries({ queryKey: orgIdentityQuery.allKey() });
      queryClient.invalidateQueries({
        queryKey: subscriptionQueryKeys.all()
      });
    }
  });
};
