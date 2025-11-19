import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TWebAuthnCredential } from "./types";

export const webAuthnKeys = {
  credentials: ["webauthn-credentials"] as const,
  registrationOptions: ["webauthn-registration-options"] as const,
  authenticationOptions: ["webauthn-authentication-options"] as const
};

export const useGetWebAuthnCredentials = () =>
  useQuery({
    queryKey: webAuthnKeys.credentials,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ credentials: TWebAuthnCredential[] }>(
        "/api/v1/user/me/webauthn"
      );
      return data.credentials;
    }
  });
