import { useServerConfig } from "@app/context";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { AuthMethod, type TokenVersion } from "@app/hooks/api/users/types";
import type { TWebAuthnCredential } from "@app/hooks/api/webauthn/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { PersonalAdapter, PersonalUser } from "./contract";

const createdAt = "2024-03-14T09:00:00Z";
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

const user = createFixtureStore<PersonalUser>({
  id: "demo-user",
  username: "sarah@acme.dev",
  email: "sarah@acme.dev",
  firstName: "Sarah",
  lastName: "Lin",
  superAdmin: false,
  authMethods: [AuthMethod.EMAIL, AuthMethod.GOOGLE],
  isMfaEnabled: true,
  selectedMfaMethod: MfaMethod.TOTP,
  seenIps: [],
  encryptionVersion: 2,
  createdAt: new Date(createdAt),
  updatedAt: new Date(createdAt)
});

const session = (
  id: string,
  ip: string,
  userAgent: string,
  lastUsedHours: number,
  createdHours: number
): TokenVersion => ({
  id,
  user: "demo-user",
  ip,
  userAgent,
  lastUsed: hoursAgo(lastUsedHours),
  createdAt: hoursAgo(createdHours),
  updatedAt: hoursAgo(lastUsedHours)
});

const sessions = createFixtureStore<TokenVersion[]>([
  session(
    "7c1f2b9e-4d0a-4b8e-9a51-3f2c6d8e1a04",
    "203.0.113.24",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    0.1,
    30
  ),
  session(
    "b2e8d4a1-93c6-4f17-8d2b-6a0e5c7f9b31",
    "198.51.100.7",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    26,
    170
  ),
  session("e5a0c3f7-1b84-4d92-a6e3-0c9f8b2d4e65", "192.0.2.180", "cli", 72, 400)
]);

const totp = createFixtureStore({ isVerified: true });

const passkeys = createFixtureStore<TWebAuthnCredential[]>([
  {
    id: "passkey-macbook",
    credentialId: "passkey-macbook",
    name: "MacBook Touch ID",
    transports: ["internal"],
    createdAt: new Date(hoursAgo(900)),
    lastUsedAt: new Date(hoursAgo(50))
  }
]);

const query = <T>(data: T) => ({
  data,
  isPending: false,
  error: null,
  refetch: async () => undefined
});

const demoRecoveryCodes = [
  "k3m9-x2p7",
  "q8v4-n6t1",
  "z5r2-w9c3",
  "h7d1-b4f8",
  "j2s6-y3l5",
  "u9e4-g1k7",
  "c6a8-m2q9",
  "t4n3-p7x1"
];

const instant =
  <TArgs extends unknown[]>(run: (...args: TArgs) => void) =>
  () => ({ isBusy: false, run });

export const personalDemo: PersonalAdapter = {
  useUser: () => query(user.use()),
  useServerConfig: () => ({
    enabledLoginMethods: null,
    passwordPolicy: useServerConfig().config.passwordPolicy
  }),
  useServerStatus: () => query({ emailConfigured: true }),
  useOrganizations: () => query([{ id: V4_DEMO_ORG_ID, enforceMfa: false }]),
  useTotpConfiguration: () => query(totp.use()),
  useWebAuthnCredentials: () => query({ fipsEnabled: false, credentials: passkeys.use() }),
  useSessions: () => query(sessions.use()),
  getCurrentAuthMethod: () => AuthMethod.EMAIL,
  useRenameUser: fixtureMutation(({ newName }: { newName: string }) => {
    const [firstName, ...rest] = newName.split(" ");
    user.update((current) => ({ ...current, firstName, lastName: rest.join(" ") }));
  }),
  useUpdateAuthMethods: fixtureMutation(({ authMethods }: { authMethods: AuthMethod[] }) => {
    user.update((current) => ({ ...current, authMethods }));
    return user.get();
  }),
  useRevokeSession: fixtureMutation((id: string) =>
    sessions.update((current) => current.filter((entry) => entry.id !== id))
  ),
  useRevokeAllSessions: fixtureMutation(() => sessions.update(() => [])),
  useDeleteMe: fixtureMutation(() => undefined),
  useRequestEmailChange: fixtureMutation(() => undefined),
  useVerifyCurrentEmail: fixtureMutation(() => undefined),
  useUpdateEmail: fixtureMutation(({ newEmail }: { newEmail: string; otpCode: string }) =>
    user.update((current) => ({ ...current, email: newEmail, username: newEmail }))
  ),
  useChangePassword: fixtureMutation(() => undefined),
  useSendPasswordSetupEmail: fixtureMutation(() => undefined),
  useEnableMfa: instant((method: MfaMethod, onEnabled: (recoveryCodes: string[]) => void) => {
    user.update((current) => ({ ...current, isMfaEnabled: true, selectedMfaMethod: method }));
    onEnabled(demoRecoveryCodes);
  }),
  useDisableMfa: instant((onDisabled: () => void) => {
    user.update((current) => ({ ...current, isMfaEnabled: false }));
    onDisabled();
  }),
  useChangePreferredMfa: instant((method: MfaMethod) =>
    user.update((current) => ({ ...current, selectedMfaMethod: method }))
  ),
  useRemoveTotp: instant((onRemoved: () => void) => {
    totp.update(() => ({ isVerified: false }));
    onRemoved();
  }),
  useRemovePasskey: instant((id: string, onRemoved: () => void) => {
    passkeys.update((current) => current.filter((entry) => entry.id !== id));
    onRemoved();
  }),
  useRecoveryCodes: instant(
    (_mode: "view" | "regenerate", onCodes: (recoveryCodes: string[]) => void) =>
      onCodes(demoRecoveryCodes)
  ),
  useTotpRegistration: () =>
    query({
      otpUrl: "otpauth://totp/Infisical:sarah@acme.dev?secret=JBSWY3DPEHPK3PXP&issuer=Infisical"
    }),
  useEnrollMfa: fixtureMutation(() => totp.update(() => ({ isVerified: true }))),
  useRegisterPasskey: () => ({
    isRegistering: false,
    registerPasskey: async (name?: string) => {
      passkeys.update((current) => [
        ...current,
        {
          id: `passkey-${current.length + 1}`,
          credentialId: `passkey-${current.length + 1}`,
          name: name?.trim() || "Passkey",
          transports: ["internal"],
          createdAt: new Date(),
          lastUsedAt: null
        }
      ]);
      return true;
    }
  }),
  endSession: () => undefined
};
