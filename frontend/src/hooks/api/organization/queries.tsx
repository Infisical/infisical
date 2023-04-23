import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import { CreateNewOrganization, DeleteOrganization, NewOrganizationResponse, Organization, RenameOrgDTO } from './types';
// import { queryClient } from '@app/reactQuery';

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

export const useCreateOrganization = () => {
  const queryClient = useQueryClient();

  return useMutation<NewOrganizationResponse, {}, CreateNewOrganization>({
    mutationFn: ({ newOrgName }: { newOrgName: string }) => 
      apiRequest.post('/api/v1/organization', { organizationName: newOrgName }),
    onSuccess: () => {
      queryClient.invalidateQueries(organizationKeys.getUserOrganization)
    }
  })
}

export const useDeleteOrganization = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, DeleteOrganization>({
    mutationFn: ({ organizationId }) => apiRequest.delete(`api/v2/organizations/${organizationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries(organizationKeys.getUserOrganization)
    }
  })  
}