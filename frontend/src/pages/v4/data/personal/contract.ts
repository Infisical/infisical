import type { RegistrationResponseJSON } from "@simplewebauthn/browser";
import { useRouteContext } from "@tanstack/react-router";

import type { TMfaStepUpChallenge } from "@app/helpers/mfaSession";
import type { TServerConfig } from "@app/hooks/api/admin/types";
import type { MfaMethod } from "@app/hooks/api/auth/types";
import type { Organization } from "@app/hooks/api/organization/types";
import type { ServerStatus } from "@app/hooks/api/serverDetails/types";
import type { AuthMethod, TokenVersion, User } from "@app/hooks/api/users/types";
import type { TGetWebAuthnCredentialsResponse } from "@app/hooks/api/webauthn/types";

import type { V4Mutation, V4QueryResult } from "../contract";

type Refetchable<TData> = V4QueryResult<TData> & { refetch: () => Promise<unknown> };

export type PersonalUser = User & { encryptionVersion?: number };

export type StepUpAction<TArgs extends unknown[]> = () => {
  isBusy: boolean;
  run: (...args: TArgs) => void;
};

export type MfaEnrollDTO =
  | { method: MfaMethod.TOTP; totp: string }
  | { method: MfaMethod.WEBAUTHN; registrationResponse: RegistrationResponseJSON; name?: string };

export type MfaEnrollmentAdapter = {
  useTotpRegistration: (options: { enabled: boolean }) => Refetchable<{ otpUrl: string }>;
  useEnrollMfa: V4Mutation<MfaEnrollDTO>;
  useRegisterPasskey: (options: { onStepUpRequired: (challenge: TMfaStepUpChallenge) => void }) => {
    registerPasskey: (
      name?: string,
      verify?: (registrationResponse: RegistrationResponseJSON, name: string) => Promise<void>
    ) => Promise<boolean>;
    isRegistering: boolean;
  };
};

export type PersonalAdapter = MfaEnrollmentAdapter & {
  useUser: () => Refetchable<PersonalUser>;
  useServerConfig: () => Pick<TServerConfig, "enabledLoginMethods" | "passwordPolicy">;
  useServerStatus: () => Refetchable<Pick<ServerStatus, "emailConfigured">>;
  useOrganizations: () => Refetchable<Pick<Organization, "id" | "enforceMfa">[]>;
  useTotpConfiguration: () => Refetchable<{ isVerified: boolean }>;
  useWebAuthnCredentials: () => Refetchable<TGetWebAuthnCredentialsResponse>;
  useSessions: () => Refetchable<TokenVersion[]>;
  getCurrentAuthMethod: () => AuthMethod | undefined;
  useRenameUser: V4Mutation<{ newName: string }>;
  useUpdateAuthMethods: V4Mutation<{ authMethods: AuthMethod[] }, User>;
  useRevokeSession: V4Mutation<string>;
  useRevokeAllSessions: V4Mutation<void>;
  useDeleteMe: V4Mutation<void>;
  useRequestEmailChange: V4Mutation<{ newEmail: string }>;
  useVerifyCurrentEmail: V4Mutation<{ otpCode: string }>;
  useUpdateEmail: V4Mutation<{ newEmail: string; otpCode: string }>;
  useChangePassword: V4Mutation<{ oldPassword: string; newPassword: string }>;
  useSendPasswordSetupEmail: V4Mutation<void>;
  useEnableMfa: StepUpAction<[method: MfaMethod, onEnabled: (recoveryCodes: string[]) => void]>;
  useDisableMfa: StepUpAction<[onDisabled: () => void]>;
  useChangePreferredMfa: StepUpAction<[method: MfaMethod]>;
  useRemoveTotp: StepUpAction<[onRemoved: () => void]>;
  useRemovePasskey: StepUpAction<[id: string, onRemoved: () => void]>;
  useRecoveryCodes: StepUpAction<
    [mode: "view" | "regenerate", onCodes: (recoveryCodes: string[]) => void]
  >;
  endSession: () => void;
};

export const usePersonalSettings = () =>
  useRouteContext({ from: "/v4/personal-settings", select: (context) => context.personal });
