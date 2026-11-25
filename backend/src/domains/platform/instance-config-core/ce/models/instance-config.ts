import { randomUUID } from "node:crypto";

import { TSuperAdmin } from "@app/db/schemas";

import { TDecrypt, TEncrypt } from "./encrypted-credentials";
import { EncryptedGitHubAppCredentials } from "./encrypted-github-app-credentials";
import { EncryptedMicrosoftTeamsCredentials } from "./encrypted-microsoft-teams-credentials";
import { EncryptedSlackCredentials } from "./encrypted-slack-credentials";
import { EnvOverrides } from "./env-overrides";
import { GitHubAppCredentials } from "./github-app-credentials";
import { InstanceSetup } from "./instance-setup";
import { LoginMethod, LoginPolicy } from "./login-policy";
import { MicrosoftTeamsAppCredentials } from "./microsoft-teams-app-credentials";
import { SignUpPolicy } from "./sign-up-policy";
import { SlackAppCredentials } from "./slack-app-credentials";

// The id of the one super_admin row. Pods of the previous release look the row up by it.
export const INSTANCE_CONFIG_ID = "00000000-0000-0000-0000-000000000000";

// The super_admin row with the default auth org fields its read joins in. Those three are read-only here: they belong
// to the org and its SSO configs, which no domain owns yet.
export type TInstanceConfigRecord = TSuperAdmin & {
  defaultAuthOrgSlug?: string | null;
  defaultAuthOrgAuthEnforced?: boolean | null;
  defaultAuthOrgAuthMethod?: string | null;
};

// What toSettings() returns: every column that is not a ciphertext.
export type TInstanceConfigSettings = {
  id: string;
  instanceId: string;
  initialized: boolean | null;
  allowSignUp: boolean | null;
  allowedSignUpDomain: string | null;
  trustLdapEmails: boolean | null;
  defaultAuthOrgId: string | null;
  enabledLoginMethods: string[] | null;
  authConsentContent: string | null;
  pageFrameContent: string | null;
  adminIdentityIds: string[] | null;
  fipsEnabled: boolean;
  onboardingCompleted: boolean;
  allowedStorageHostnames: string[] | null;
  createdAt: Date;
  updatedAt: Date;
  defaultAuthOrgSlug: string | null;
  defaultAuthOrgAuthEnforced: boolean | null;
  defaultAuthOrgAuthMethod: string | null;
};

// The instance's configuration: the single super_admin row. Each group of columns with rules of its own is a value
// object; this class applies a change to the groups it touches and maps them back to the row.
export class InstanceConfig {
  private constructor(
    readonly id: string,
    private readonly instanceId: string,
    private setup: InstanceSetup,
    private signUp: SignUpPolicy,
    private login: LoginPolicy,
    private authConsentContent: string | null,
    private pageFrameContent: string | null,
    private allowedStorageHostnames: string[] | null,
    private slack: EncryptedSlackCredentials,
    private microsoftTeams: EncryptedMicrosoftTeamsCredentials,
    private gitHubApp: EncryptedGitHubAppCredentials,
    private readonly fipsEnabled: boolean,
    private encryptedEnvOverrides: Buffer | null,
    private readonly createdAt: Date,
    readonly updatedAt: Date
  ) {}

  // The row a new instance starts with: sign-up open, setup not done.
  static create({ fipsEnabled }: { fipsEnabled: boolean }): InstanceConfig {
    const now = new Date();
    return InstanceConfig.restore({
      id: INSTANCE_CONFIG_ID,
      instanceId: randomUUID(),
      initialized: false,
      allowSignUp: true,
      defaultAuthOrgId: null,
      fipsEnabled,
      onboardingCompleted: false,
      createdAt: now,
      updatedAt: now
    });
  }

  static restore(record: TInstanceConfigRecord): InstanceConfig {
    return new InstanceConfig(
      record.id,
      record.instanceId,
      InstanceSetup.restore(record),
      SignUpPolicy.restore(record),
      LoginPolicy.restore(record),
      record.authConsentContent ?? null,
      record.pageFrameContent ?? null,
      record.allowedStorageHostnames ?? null,
      EncryptedSlackCredentials.restore(record),
      EncryptedMicrosoftTeamsCredentials.restore(record),
      EncryptedGitHubAppCredentials.restore(record),
      record.fipsEnabled,
      record.encryptedEnvOverrides ?? null,
      record.createdAt,
      record.updatedAt
    );
  }

  isAdminIdentity(identityId: string): boolean {
    return this.setup.isAdminIdentity(identityId);
  }

  loginPolicy(): LoginPolicy {
    return this.login;
  }

  signUpPolicy(): SignUpPolicy {
    return this.signUp;
  }

  changeSignUpPolicy(policy: { allowSignUp?: boolean; allowedSignUpDomain?: string | null }): void {
    this.signUp = this.signUp.change(policy);
  }

  changeLoginMethods(methods: LoginMethod[]): void {
    this.login = this.login.changeLoginMethods(methods);
  }

  changeTrustLdapEmails(trust: boolean): void {
    this.login = this.login.changeTrustLdapEmails(trust);
  }

  changeDefaultAuthOrg(orgId: string | null): void {
    this.login = this.login.changeDefaultAuthOrg(orgId);
  }

  changeBranding(branding: { authConsentContent?: string; pageFrameContent?: string }): void {
    if (branding.authConsentContent !== undefined) this.authConsentContent = branding.authConsentContent;
    if (branding.pageFrameContent !== undefined) this.pageFrameContent = branding.pageFrameContent;
  }

  changeAllowedStorageHostnames(hostnames: string[]): void {
    this.allowedStorageHostnames = [...hostnames];
  }

  changeOnboardingStatus(completed: boolean): void {
    this.setup = this.setup.changeOnboardingStatus(completed);
  }

  assertNotSetUp(): void {
    this.setup.assertNotSetUp();
  }

  // The first admin finished setting the instance up. Self-hosted instances close sign-up from then on.
  completeSetup({ closeSignUp }: { closeSignUp: boolean }): void {
    this.setup = this.setup.complete();
    if (closeSignUp) this.signUp = this.signUp.close();
  }

  grantAdminIdentity(identityId: string): void {
    this.setup = this.setup.grantAdminIdentity(identityId);
  }

  revokeAdminIdentity(identityId: string): void {
    this.setup = this.setup.revokeAdminIdentity(identityId);
  }

  // Values left undefined stay as they are.
  changeSlackCredentials(input: { clientId?: string; clientSecret?: string }, encrypt: TEncrypt): void {
    this.slack = this.slack.change(input, encrypt);
  }

  changeMicrosoftTeamsCredentials(
    input: { appId?: string; clientSecret?: string; botId?: string },
    encrypt: TEncrypt
  ): void {
    this.microsoftTeams = this.microsoftTeams.change(input, encrypt);
  }

  changeGitHubAppCredentials(
    input: { clientId?: string; clientSecret?: string; appSlug?: string; appId?: string; privateKey?: string },
    encrypt: TEncrypt
  ): void {
    this.gitHubApp = this.gitHubApp.change(input, encrypt);
  }

  replaceEnvOverrides(overrides: EnvOverrides, encrypt: TEncrypt): void {
    this.encryptedEnvOverrides = encrypt(overrides.toBytes());
  }

  slackCredentials(decrypt: TDecrypt): SlackAppCredentials {
    return this.slack.decrypt(decrypt);
  }

  microsoftTeamsCredentials(decrypt: TDecrypt): MicrosoftTeamsAppCredentials {
    return this.microsoftTeams.decrypt(decrypt);
  }

  gitHubAppCredentials(decrypt: TDecrypt): GitHubAppCredentials {
    return this.gitHubApp.decrypt(decrypt);
  }

  envOverrides(decrypt: TDecrypt): EnvOverrides {
    return this.encryptedEnvOverrides
      ? EnvOverrides.fromBytes(decrypt(this.encryptedEnvOverrides))
      : EnvOverrides.none();
  }

  // Identifies the stored overrides without decrypting them, so a resolution can be reused until they change.
  envOverridesVersion(): string {
    return this.encryptedEnvOverrides ? this.encryptedEnvOverrides.toString("base64") : "";
  }

  // An allowlist, field by field: a column added later, to this class or to a group, stays out of every response
  // until it is listed here.
  toSettings(): TInstanceConfigSettings {
    const setup = this.setup.toJSON();
    const signUp = this.signUp.toJSON();
    const login = this.login.toJSON();
    return {
      id: this.id,
      instanceId: this.instanceId,
      initialized: setup.initialized,
      allowSignUp: signUp.allowSignUp,
      allowedSignUpDomain: signUp.allowedSignUpDomain,
      trustLdapEmails: login.trustLdapEmails,
      defaultAuthOrgId: login.defaultAuthOrgId,
      enabledLoginMethods: login.enabledLoginMethods,
      authConsentContent: this.authConsentContent,
      pageFrameContent: this.pageFrameContent,
      adminIdentityIds: setup.adminIdentityIds,
      fipsEnabled: this.fipsEnabled,
      onboardingCompleted: setup.onboardingCompleted,
      allowedStorageHostnames: this.allowedStorageHostnames,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      defaultAuthOrgSlug: login.defaultAuthOrgSlug,
      defaultAuthOrgAuthEnforced: login.defaultAuthOrgAuthEnforced,
      defaultAuthOrgAuthMethod: login.defaultAuthOrgAuthMethod
    };
  }

  // The full row, ciphertext included: the shape the shared cache has always held. The satisfies check fails to
  // compile when a column is added to super_admin until it is listed here (and so in the cache and in save()).
  toJSON(): TInstanceConfigRecord {
    return {
      ...this.toSettings(),
      ...this.slack.toJSON(),
      ...this.microsoftTeams.toJSON(),
      ...this.gitHubApp.toJSON(),
      encryptedEnvOverrides: this.encryptedEnvOverrides
    } satisfies Record<keyof TInstanceConfigRecord, unknown>;
  }
}
