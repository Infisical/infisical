import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { SecretSharingAccessType, TSharedSecret, TViewSharedSecretResponse } from "./types";

export const useGetSharedSecrets = () => {
  return useQuery({
    queryKey: ["sharedSecrets"],
    queryFn: async () => {
      const { data } = await apiRequest.get<TSharedSecret[]>("/api/v1/secret-sharing/");
      return data;
    }
  });
};

export const useGetActiveSharedSecretByIdAndHashedHex = (id: string, hashedHex: string) => {
  return useQuery<TViewSharedSecretResponse, [string]>({
    queryFn: async () => {
      if(!id || !hashedHex) return Promise.resolve({ encryptedValue: "", iv: "", tag: "", accessType: SecretSharingAccessType.Organization, orgName: "" });
      const { data } = await apiRequest.get<TViewSharedSecretResponse>(
        `/api/v1/secret-sharing/public/${id}?hashedHex=${hashedHex}`
      );
      return {
        encryptedValue: data.encryptedValue,
        iv: data.iv,
        tag: data.tag,
        accessType: data.accessType,
        orgName: data.orgName
      };
    }
  });
};
