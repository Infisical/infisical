
import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TUserCredential } from "./types";

type TCreateUserCredentialDTO = {
  credential: TUserCredential;
  orgId: string;
  userId: string;
};

export const useCreateCredential = () => {
  return useMutation<{}, {}, TCreateUserCredentialDTO>({
    mutationFn: async ({ credential, orgId }) => {
      const { data } = await apiRequest.post<TUserCredential>(
        `/api/v1/user-credential/${orgId}`,
        credential
      );
      return data;
    }
  });
};



