import { randomUUID } from "node:crypto";

import { TSuperAdmin } from "@app/db/schemas";
import { RuleViolationError, StateConflictError } from "@app/domains/lib/errors";

import { EnvOverrides } from "./env-overrides";
import { GitHubAppCredentials } from "./github-app-credentials";
import { MicrosoftTeamsAppCredentials } from "./microsoft-teams-app-credentials";
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

// Encrypts and decrypts with the instance root key. The service hands them in from KMS Core.
export type TEncrypt = (plainText: Buffer) => Buffer;
export type TDecrypt = (cipherText: Buffer) => Buffer;

// A change of a Slack or Teams credential cannot clear it: an empty value is refused by name.
const assertNotCleared = (label: string, value: string | undefined) => {
  if (value === "") {
    throw new RuleViolationError({
      message: `${label} cannot be empty. Slack and Microsoft Teams credentials can be changed but not cleared.`
    });
  }
};

// The instance's configuration: the single super_admin row.
export class InstanceConfig {
  private constructor(
    readonly id: string,
    private readonly instanceId: string,
    private initialized: boolean | null,
    private allowSignUp: boolean | null,
    private allowedSignUpDomain: string | null,
    private trustLdapEmails: boolean | null,
    private defaultAuthOrgId: string | null,
    private enabledLoginMethods: string[] | null,
    private authConsentContent: string | null,
    private pageFrameContent: string | null,
    private adminIdentityIds: string[] | null,
    private readonly fipsEnabled: boolean,
    private onboardingCompleted: boolean,
    private allowedStorageHostnames: string[] | null,
    private encryptedSlackClientId: Buffer | null,
    private encryptedSlackClientSecret: Buffer | null,
    private encryptedMicrosoftTeamsAppId: Buffer | null,
    private encryptedMicrosoftTeamsClientSecret: Buffer | null,
    private encryptedMicrosoftTeamsBotId: Buffer | null,
    private encryptedGitHubAppConnectionClientId: Buffer | null,
    private encryptedGitHubAppConnectionClientSecret: Buffer | null,
    private encryptedGitHubAppConnectionSlug: Buffer | null,
    private encryptedGitHubAppConnectionId: Buffer | null,
    private encryptedGitHubAppConnectionPrivateKey: Buffer | null,
    private encryptedEnvOverrides: Buffer | null,
    private readonly createdAt: Date,
    readonly updatedAt: Date,
    private readonly defaultAuthOrgSlug: string | null,
    private readonly defaultAuthOrgAuthEnforced: boolean | null,
    private readonly defaultAuthOrgAuthMethod: string | null
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
      record.initialized ?? null,
      record.allowSignUp ?? null,
      record.allowedSignUpDomain ?? null,
      record.trustLdapEmails ?? null,
      record.defaultAuthOrgId ?? null,
      record.enabledLoginMethods ?? null,
      record.authConsentContent ?? null,
      record.pageFrameContent ?? null,
      record.adminIdentityIds ?? null,
      record.fipsEnabled,
      record.onboardingCompleted,
      record.allowedStorageHostnames ?? null,
      record.encryptedSlackClientId ?? null,
      record.encryptedSlackClientSecret ?? null,
      record.encryptedMicrosoftTeamsAppId ?? null,
      record.encryptedMicrosoftTeamsClientSecret ?? null,
      record.encryptedMicrosoftTeamsBotId ?? null,
      record.encryptedGitHubAppConnectionClientId ?? null,
      record.encryptedGitHubAppConnectionClientSecret ?? null,
      record.encryptedGitHubAppConnectionSlug ?? null,
      record.encryptedGitHubAppConnectionId ?? null,
      record.encryptedGitHubAppConnectionPrivateKey ?? null,
      record.encryptedEnvOverrides ?? null,
      record.createdAt,
      record.updatedAt,
      record.defaultAuthOrgSlug || null,
      record.defaultAuthOrgAuthEnforced ?? null,
      record.defaultAuthOrgAuthMethod ?? null
    );
  }

  get isSetUp(): boolean {
    return Boolean(this.initialized);
  }

  isAdminIdentity(identityId: string): boolean {
    return (this.adminIdentityIds ?? []).includes(identityId);
  }

  changeSignUpPolicy(policy: {
    allowSignUp?: boolean;
    allowedSignUpDomain?: string | null;
    trustLdapEmails?: boolean;
  }): void {
    if (policy.allowSignUp !== undefined) this.allowSignUp = policy.allowSignUp;
    if (policy.allowedSignUpDomain !== undefined) this.allowedSignUpDomain = policy.allowedSignUpDomain;
    if (policy.trustLdapEmails !== undefined) this.trustLdapEmails = policy.trustLdapEmails;
  }

  changeLoginMethods(methods: string[]): void {
    if (methods.length === 0) {
      throw new RuleViolationError({ message: "At least one login method should be enabled." });
    }
    this.enabledLoginMethods = [...methods];
  }

  // The joined slug and SSO fields describe the previous org until the row is read again.
  changeDefaultAuthOrg(orgId: string | null): void {
    this.defaultAuthOrgId = orgId;
  }

  changeBranding(branding: { authConsentContent?: string; pageFrameContent?: string }): void {
    if (branding.authConsentContent !== undefined) this.authConsentContent = branding.authConsentContent;
    if (branding.pageFrameContent !== undefined) this.pageFrameContent = branding.pageFrameContent;
  }

  changeAllowedStorageHostnames(hostnames: string[]): void {
    this.allowedStorageHostnames = [...hostnames];
  }

  changeOnboardingStatus(completed: boolean): void {
    this.onboardingCompleted = completed;
  }

  // The first admin finished setting the instance up. Self-hosted instances close sign-up from then on.
  assertNotSetUp(): void {
    if (this.initialized) throw new StateConflictError({ message: "Instance has already been set up" });
  }

  completeSetup({ closeSignUp }: { closeSignUp: boolean }): void {
    this.assertNotSetUp();
    this.initialized = true;
    if (closeSignUp) this.allowSignUp = false;
  }

  grantAdminIdentity(identityId: string): void {
    if (this.isAdminIdentity(identityId)) return;
    this.adminIdentityIds = [...(this.adminIdentityIds ?? []), identityId];
  }

  revokeAdminIdentity(identityId: string): void {
    if (!this.isAdminIdentity(identityId)) {
      throw new RuleViolationError({ name: "Identity", message: "Identity does not have super admin access" });
    }
    this.adminIdentityIds = (this.adminIdentityIds ?? []).filter((id) => id !== identityId);
  }

  // Values left undefined stay as they are.
  changeSlackCredentials(input: { clientId?: string; clientSecret?: string }, encrypt: TEncrypt): void {
    assertNotCleared("Slack client ID", input.clientId);
    assertNotCleared("Slack client secret", input.clientSecret);
    if (input.clientId !== undefined) this.encryptedSlackClientId = encrypt(Buffer.from(input.clientId));
    if (input.clientSecret !== undefined) this.encryptedSlackClientSecret = encrypt(Buffer.from(input.clientSecret));
  }

  changeMicrosoftTeamsCredentials(
    input: { appId?: string; clientSecret?: string; botId?: string },
    encrypt: TEncrypt
  ): void {
    assertNotCleared("Microsoft Teams app ID", input.appId);
    assertNotCleared("Microsoft Teams client secret", input.clientSecret);
    assertNotCleared("Microsoft Teams bot ID", input.botId);
    if (input.appId !== undefined) this.encryptedMicrosoftTeamsAppId = encrypt(Buffer.from(input.appId));
    if (input.clientSecret !== undefined) {
      this.encryptedMicrosoftTeamsClientSecret = encrypt(Buffer.from(input.clientSecret));
    }
    if (input.botId !== undefined) this.encryptedMicrosoftTeamsBotId = encrypt(Buffer.from(input.botId));
  }

  // Unlike Slack and Teams, "" is stored: it clears the value.
  changeGitHubAppCredentials(
    input: { clientId?: string; clientSecret?: string; appSlug?: string; appId?: string; privateKey?: string },
    encrypt: TEncrypt
  ): void {
    const encryptIfGiven = (value: string | undefined, current: Buffer | null) =>
      value !== undefined ? encrypt(Buffer.from(value)) : current;
    this.encryptedGitHubAppConnectionClientId = encryptIfGiven(
      input.clientId,
      this.encryptedGitHubAppConnectionClientId
    );
    this.encryptedGitHubAppConnectionClientSecret = encryptIfGiven(
      input.clientSecret,
      this.encryptedGitHubAppConnectionClientSecret
    );
    this.encryptedGitHubAppConnectionSlug = encryptIfGiven(input.appSlug, this.encryptedGitHubAppConnectionSlug);
    this.encryptedGitHubAppConnectionId = encryptIfGiven(input.appId, this.encryptedGitHubAppConnectionId);
    this.encryptedGitHubAppConnectionPrivateKey = encryptIfGiven(
      input.privateKey,
      this.encryptedGitHubAppConnectionPrivateKey
    );
  }

  replaceEnvOverrides(overrides: EnvOverrides, encrypt: TEncrypt): void {
    this.encryptedEnvOverrides = encrypt(overrides.toBytes());
  }

  // Each integration decrypts only its own columns, so a column that cannot be decrypted breaks only its integration.
  slackCredentials(decrypt: TDecrypt): SlackAppCredentials {
    return SlackAppCredentials.restore({
      clientId: InstanceConfig.decryptText(this.encryptedSlackClientId, decrypt),
      clientSecret: InstanceConfig.decryptText(this.encryptedSlackClientSecret, decrypt)
    });
  }

  microsoftTeamsCredentials(decrypt: TDecrypt): MicrosoftTeamsAppCredentials {
    return MicrosoftTeamsAppCredentials.restore({
      appId: InstanceConfig.decryptText(this.encryptedMicrosoftTeamsAppId, decrypt),
      clientSecret: InstanceConfig.decryptText(this.encryptedMicrosoftTeamsClientSecret, decrypt),
      botId: InstanceConfig.decryptText(this.encryptedMicrosoftTeamsBotId, decrypt)
    });
  }

  gitHubAppCredentials(decrypt: TDecrypt): GitHubAppCredentials {
    return GitHubAppCredentials.restore({
      clientId: InstanceConfig.decryptText(this.encryptedGitHubAppConnectionClientId, decrypt),
      clientSecret: InstanceConfig.decryptText(this.encryptedGitHubAppConnectionClientSecret, decrypt),
      appSlug: InstanceConfig.decryptText(this.encryptedGitHubAppConnectionSlug, decrypt),
      appId: InstanceConfig.decryptText(this.encryptedGitHubAppConnectionId, decrypt),
      privateKey: InstanceConfig.decryptText(this.encryptedGitHubAppConnectionPrivateKey, decrypt)
    });
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

  // An allowlist: a column added later stays out of every response until it is listed here.
  toSettings(): TInstanceConfigSettings {
    return {
      id: this.id,
      instanceId: this.instanceId,
      initialized: this.initialized,
      allowSignUp: this.allowSignUp,
      allowedSignUpDomain: this.allowedSignUpDomain,
      trustLdapEmails: this.trustLdapEmails,
      defaultAuthOrgId: this.defaultAuthOrgId,
      enabledLoginMethods: this.enabledLoginMethods,
      authConsentContent: this.authConsentContent,
      pageFrameContent: this.pageFrameContent,
      adminIdentityIds: this.adminIdentityIds,
      fipsEnabled: this.fipsEnabled,
      onboardingCompleted: this.onboardingCompleted,
      allowedStorageHostnames: this.allowedStorageHostnames,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      defaultAuthOrgSlug: this.defaultAuthOrgSlug,
      defaultAuthOrgAuthEnforced: this.defaultAuthOrgAuthEnforced,
      defaultAuthOrgAuthMethod: this.defaultAuthOrgAuthMethod
    };
  }

  // The full row, ciphertext included: the shape the shared cache has always held. The satisfies check fails to
  // compile when a column is added to super_admin until it is listed here (and so in the cache and in save()).
  toJSON(): TInstanceConfigRecord {
    return {
      ...this.toSettings(),
      encryptedSlackClientId: this.encryptedSlackClientId,
      encryptedSlackClientSecret: this.encryptedSlackClientSecret,
      encryptedMicrosoftTeamsAppId: this.encryptedMicrosoftTeamsAppId,
      encryptedMicrosoftTeamsClientSecret: this.encryptedMicrosoftTeamsClientSecret,
      encryptedMicrosoftTeamsBotId: this.encryptedMicrosoftTeamsBotId,
      encryptedGitHubAppConnectionClientId: this.encryptedGitHubAppConnectionClientId,
      encryptedGitHubAppConnectionClientSecret: this.encryptedGitHubAppConnectionClientSecret,
      encryptedGitHubAppConnectionSlug: this.encryptedGitHubAppConnectionSlug,
      encryptedGitHubAppConnectionId: this.encryptedGitHubAppConnectionId,
      encryptedGitHubAppConnectionPrivateKey: this.encryptedGitHubAppConnectionPrivateKey,
      encryptedEnvOverrides: this.encryptedEnvOverrides
    } satisfies Record<keyof TInstanceConfigRecord, unknown>;
  }

  private static decryptText(cipherText: Buffer | null, decrypt: TDecrypt): string {
    return cipherText ? decrypt(cipherText).toString() : "";
  }
}
