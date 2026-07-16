import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGetWebAuthnCredentialsResponse } from "./types";

export const webAuthnKeys = {
  credentials: ["webauthn-credentials"] as const,
  registrationOptions: ["webauthn-registration-options"] as const,
  authenticationOptions: ["webauthn-authentication-options"] as const
};

export const useGetWebAuthnCredentials = () =>
  useQuery({
    queryKey: webAuthnKeys.credentials,
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetWebAuthnCredentialsResponse>(
        "/api/v1/user/me/webauthn"
      );
      return data;
    }
  });
