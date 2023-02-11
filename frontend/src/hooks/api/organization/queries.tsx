import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import { Organization } from './types';

const organizationKeys = {
  getUserOrganization: ['organization'] as const
};

const fetchUserOrganization = async () => {
  const { data } = await apiRequest.get<{ organizations: Organization[] }>('/api/v1/organization');

  return data.organizations;
};

export const useGetOrganization = () =>
  useQuery({ queryKey: organizationKeys.getUserOrganization, queryFn: fetchUserOrganization });
