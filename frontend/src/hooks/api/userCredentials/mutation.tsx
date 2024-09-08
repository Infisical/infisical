
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { queryKeys } from "./queries";
import { CredentialKind, TUserCredential } from "./types";

type TCreateUserCredentialDTO = {
  credential: TUserCredential;
  orgId: string;
  userId: string;
};

export const useCreateCredential = () => {
  const queryClient = useQueryClient();
  return useMutation<TUserCredential, {}, TCreateUserCredentialDTO>({
    mutationFn: async ({ credential, orgId }) => {
      const { data } = await apiRequest.post<TUserCredential>(
        `/api/v1/user-credential/${orgId}`,
        credential
      );
      return data;
    },

    onSuccess: () => queryClient.invalidateQueries(queryKeys.getCredentials)
  });
};


type TDeleteUserCredential = {
  kind: CredentialKind;
  credentialId: string;
}

export const useDeleteCredential = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, credentialId }: TDeleteUserCredential) => {
      await apiRequest.delete<TUserCredential, void, { kind: CredentialKind }>(
        `/api/v1/user-credential/${credentialId}`,
        { data: { kind } }
      );
    },
    onSuccess: () => queryClient.invalidateQueries(queryKeys.getCredentials)
  });
};

