import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { AddIncidentContactDTO, DeleteIncidentContactDTO, IncidentContact } from "./types";

const incidentContactKeys = {
  getAllContact: (orgId: string) => ["org-incident-contacts", { orgId }] as const
};

export const useGetOrgIncidentContact = (orgId: string) =>
  useQuery({
    queryKey: incidentContactKeys.getAllContact(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ incidentContactsOrg: IncidentContact[] }>(
        `/api/v1/organization/${orgId}/incidentContactOrg`
      );

      return data.incidentContactsOrg;
    },
    enabled: Boolean(orgId)
  });

// mutation
export const useAddIncidentContact = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, AddIncidentContactDTO>({
    mutationFn: async ({ orgId, email }) => {
      const { data } = await apiRequest.post(`/api/v1/organization/${orgId}/incidentContactOrg`, {
        email
      });
      return data;
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries(incidentContactKeys.getAllContact(orgId));
    }
  });
};

export const useDeleteIncidentContact = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, DeleteIncidentContactDTO>({
    mutationFn: async ({ orgId, email }) => {
      const { data } = await apiRequest.delete(`/api/v1/organization/${orgId}/incidentContactOrg`, {
        data: { email }
      });
      return data;
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries(incidentContactKeys.getAllContact(orgId));
    }
  });
};
