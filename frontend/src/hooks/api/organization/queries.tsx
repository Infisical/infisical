import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import { Organization, RenameOrgDTO } from './types';

const organizationKeys = {
  getUserOrganization: ['organization'] as const
};

const fetchUserOrganization = async () => {
  const { data } = await apiRequest.get<{ organizations: Organization[] }>('/api/v1/organization');

  return data.organizations;
};

export const useGetOrganization = () =>
  useQuery({ queryKey: organizationKeys.getUserOrganization, queryFn: fetchUserOrganization });

// mutation
export const useRenameOrg = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, RenameOrgDTO>({
    mutationFn: ({ newOrgName, orgId }) =>
      apiRequest.patch(`/api/v1/organization/${orgId}/name`, { name: newOrgName }),
    onSuccess: () => {
      queryClient.invalidateQueries(organizationKeys.getUserOrganization);
    }
  });
};
