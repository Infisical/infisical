import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import SecurityClient from "@app/components/utilities/SecurityClient";
import { apiRequest } from "@app/config/request";
import { setAuthToken } from "@app/reactQuery";

import { organizationKeys } from "../organization/queries";
import { workspaceKeys } from "../workspace/queries";
import {
  ChangePasswordDTO,
  CompleteAccountDTO,
  CompleteAccountSignupDTO,
  GetAuthTokenAPI,
  GetBackupEncryptedPrivateKeyDTO,
  IssueBackupPrivateKeyDTO,
  Login1DTO,
  Login1Res,
  Login2DTO,
  Login2Res,
  LoginLDAPDTO,
  LoginLDAPRes,
  ResetPasswordDTO,
  SendMfaTokenDTO,
  SRP1DTO,
  SRPR1Res,
  TOauthTokenExchangeDTO,
  UserAgentType,
  VerifyMfaTokenDTO,
  VerifyMfaTokenRes,
  VerifySignupInviteDTO
} from "./types";

const authKeys = {
  getAuthToken: ["token"] as const
};

export const login1 = async (loginDetails: Login1DTO) => {
  const { data } = await apiRequest.post<Login1Res>("/api/v3/auth/login1", loginDetails);
  return data;
};

export const login2 = async (loginDetails: Login2DTO) => {
  const { data } = await apiRequest.post<Login2Res>("/api/v3/auth/login2", loginDetails);
  return data;
};

export const loginLDAPRedirect = async (loginLDAPDetails: LoginLDAPDTO) => {
  const { data } = await apiRequest.post<LoginLDAPRes>("/api/v1/ldap/login", loginLDAPDetails); // return if account is complete or not + provider auth token
  return data;
};

export const useLogin1 = () => {
  return useMutation({
    mutationFn: async (details: {
      email: string;
      clientPublicKey: string;
      providerAuthToken?: string;
    }) => {
      return login1(details);
    }
  });
};

export const selectOrganization = async (data: {
  organizationId: string;
  userAgent?: UserAgentType;
}) => {
  const { data: res } = await apiRequest.post<{ token: string }>(
    "/api/v3/auth/select-organization",
    data
  );
  return res;
};

export const useSelectOrganization = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (details: { organizationId: string; userAgent?: UserAgentType }) => {
      const data = await selectOrganization(details);

      // If a custom user agent is set, then this session is meant for another consuming application, not the web application.
      if (!details.userAgent) {
        SecurityClient.setToken(data.token);
        SecurityClient.setProviderAuthToken("");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries([
        organizationKeys.getUserOrganizations,
        workspaceKeys.getAllUserWorkspace
      ]);
    }
  });
};

export const useLogin2 = () => {
  return useMutation({
    mutationFn: async (details: {
      email: string;
      clientProof: string;
      password: string;
      providerAuthToken?: string;
    }) => {
      return login2(details);
    }
  });
};

export const oauthTokenExchange = async (details: TOauthTokenExchangeDTO) => {
  const { data } = await apiRequest.post<Login2Res>("/api/v1/sso/token-exchange", details);
  return data;
};

export const useOauthTokenExchange = () => {
  // note: use after srp1
  return useMutation({
    mutationFn: async (details: TOauthTokenExchangeDTO) => {
      return oauthTokenExchange(details);
    }
  });
};

export const srp1 = async (details: SRP1DTO) => {
  const { data } = await apiRequest.post<SRPR1Res>("/api/v1/password/srp1", details);
  return data;
};

export const completeAccountSignup = async (details: CompleteAccountSignupDTO) => {
  const { data } = await apiRequest.post("/api/v3/signup/complete-account/signup", details);
  return data;
};

export const completeAccountSignupInvite = async (details: CompleteAccountDTO) => {
  const { data } = await apiRequest.post("/api/v3/signup/complete-account/invite", details);
  return data;
};

export const useCompleteAccountSignup = () => {
  return useMutation({
    mutationFn: async (details: CompleteAccountSignupDTO) => {
      return completeAccountSignup(details);
    }
  });
};

export const useSendMfaToken = () => {
  return useMutation<{}, {}, SendMfaTokenDTO>({
    mutationFn: async ({ email }) => {
      const { data } = await apiRequest.post("/api/v2/auth/mfa/send", { email });
      return data;
    }
  });
};

export const verifyMfaToken = async ({ email, mfaCode }: { email: string; mfaCode: string }) => {
  const { data } = await apiRequest.post("/api/v2/auth/mfa/verify", {
    email,
    mfaToken: mfaCode
  });

  return data;
};

export const useVerifyMfaToken = () => {
  return useMutation<VerifyMfaTokenRes, {}, VerifyMfaTokenDTO>({
    mutationFn: async ({ email, mfaCode }) => {
      return verifyMfaToken({
        email,
        mfaCode
      });
    }
  });
};

export const verifySignupInvite = async (details: VerifySignupInviteDTO) => {
  const { data } = await apiRequest.post("/api/v1/invite-org/verify", details);
  return data;
};

export const useSendVerificationEmail = () => {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { data } = await apiRequest.post("/api/v3/signup/email/signup", {
        email
      });

      return data;
    }
  });
};

export const useVerifySignupEmailVerificationCode = () => {
  return useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      const { data } = await apiRequest.post("/api/v3/signup/email/verify", {
        email,
        code
      });

      return data;
    }
  });
};

export const useSendPasswordResetEmail = () => {
  return useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { data } = await apiRequest.post("/api/v1/password/email/password-reset", {
        email
      });

      return data;
    }
  });
};

export const useVerifyPasswordResetCode = () => {
  return useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      const { data } = await apiRequest.post("/api/v1/password/email/password-reset-verify", {
        email,
        code
      });

      return data;
    }
  });
};

export const issueBackupPrivateKey = async (details: IssueBackupPrivateKeyDTO) => {
  const { data } = await apiRequest.post("/api/v1/password/backup-private-key", details);
  return data;
};

export const getBackupEncryptedPrivateKey = async ({
  verificationToken
}: GetBackupEncryptedPrivateKeyDTO) => {
  const { data } = await apiRequest.get("/api/v1/password/backup-private-key", {
    headers: {
      Authorization: `Bearer ${verificationToken}`
    }
  });

  return data.backupPrivateKey;
};

export const useResetPassword = () => {
  return useMutation({
    mutationFn: async (details: ResetPasswordDTO) => {
      const { data } = await apiRequest.post(
        "/api/v1/password/password-reset",
        {
          protectedKey: details.protectedKey,
          protectedKeyIV: details.protectedKeyIV,
          protectedKeyTag: details.protectedKeyTag,
          encryptedPrivateKey: details.encryptedPrivateKey,
          encryptedPrivateKeyIV: details.encryptedPrivateKeyIV,
          encryptedPrivateKeyTag: details.encryptedPrivateKeyTag,
          salt: details.salt,
          verifier: details.verifier
        },
        {
          headers: {
            Authorization: `Bearer ${details.verificationToken}`
          }
        }
      );

      return data;
    }
  });
};

export const changePassword = async (details: ChangePasswordDTO) => {
  const { data } = await apiRequest.post("/api/v1/password/change-password", details);
  return data;
};

export const useChangePassword = () => {
  // note: use after srp1
  return useMutation({
    mutationFn: async (details: ChangePasswordDTO) => {
      return changePassword(details);
    }
  });
};

// Refresh token is set as cookie when logged in
// Using that we fetch the auth bearer token needed for auth calls
const fetchAuthToken = async () => {
  const { data } = await apiRequest.post<GetAuthTokenAPI>("/api/v1/auth/token", undefined, {
    withCredentials: true
  });

  return data;
};

export const useGetAuthToken = () =>
  useQuery(authKeys.getAuthToken, fetchAuthToken, {
    onSuccess: (data) => setAuthToken(data.token),
    retry: 0
  });
