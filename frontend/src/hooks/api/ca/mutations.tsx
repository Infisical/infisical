import {
  useMutation
  // useQueryClient
} from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCertificateAuthority, TCreateCaDTO } from "./types";

export const useCreateCa = () => {
  // const queryClient = useQueryClient();
  return useMutation<TCertificateAuthority, {}, TCreateCaDTO>({
    mutationFn: async (body) => {
      const {
        data: { identity }
      } = await apiRequest.post("/api/v1/ca/", body);
      return identity;
    },
    onSuccess: () => {
      //   queryClient.invalidateQueries(organizationKeys.getOrgIdentityMemberships(organizationId));
    }
  });
};
