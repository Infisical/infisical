import { TSuperAdmin, TSuperAdminInsert } from "@app/db/schemas";
import { pick } from "@app/lib/fn";

export type TEncryptedColumn =
  | "encryptedSlackClientId"
  | "encryptedSlackClientSecret"
  | "encryptedMicrosoftTeamsAppId"
  | "encryptedMicrosoftTeamsClientSecret"
  | "encryptedMicrosoftTeamsBotId"
  | "encryptedGitHubAppConnectionClientId"
  | "encryptedGitHubAppConnectionClientSecret"
  | "encryptedGitHubAppConnectionSlug"
  | "encryptedGitHubAppConnectionId"
  | "encryptedGitHubAppConnectionPrivateKey"
  | "encryptedEnvOverrides";

// The super_admin row with the default auth org fields its read joins in.
export type TInstanceConfigProps = TSuperAdmin & {
  defaultAuthOrgSlug: string | null;
  defaultAuthOrgAuthEnforced?: boolean | null;
  defaultAuthOrgAuthMethod?: string | null;
};

export type TInstanceConfigSettings = Pick<TInstanceConfigProps, (typeof InstanceConfig.SETTING_FIELDS)[number]>;

// The instance's configuration: the single super_admin row.
export class InstanceConfig {
  // The fields toSettings() returns. An allowlist, so a column added later stays out of every response, ciphertext
  // included, until someone lists it here.
  static readonly SETTING_FIELDS = [
    "id",
    "initialized",
    "allowSignUp",
    "allowedSignUpDomain",
    "instanceId",
    "trustLdapEmails",
    "defaultAuthOrgId",
    "enabledLoginMethods",
    "authConsentContent",
    "pageFrameContent",
    "adminIdentityIds",
    "fipsEnabled",
    "onboardingCompleted",
    "allowedStorageHostnames",
    "createdAt",
    "updatedAt",
    "defaultAuthOrgSlug",
    "defaultAuthOrgAuthEnforced",
    "defaultAuthOrgAuthMethod"
  ] as const;

  private constructor(private readonly props: TInstanceConfigProps) {}

  static restore(props: TInstanceConfigProps): InstanceConfig {
    return new InstanceConfig({ ...props, defaultAuthOrgSlug: props.defaultAuthOrgSlug || null });
  }

  // The settings a new instance starts with.
  static initialSettings({ fipsEnabled }: { fipsEnabled: boolean }): TSuperAdminInsert {
    return { fipsEnabled, initialized: false, allowSignUp: true, defaultAuthOrgId: null };
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get adminIdentityIds(): string[] {
    return this.props.adminIdentityIds ?? [];
  }

  encrypted(column: TEncryptedColumn): Buffer | null {
    return this.props[column] ?? null;
  }

  toSettings(): TInstanceConfigSettings {
    return pick(this.props, [...InstanceConfig.SETTING_FIELDS]);
  }

  // The full row, ciphertext included: the shape the shared cache has always held.
  toJSON(): TInstanceConfigProps {
    return { ...this.props };
  }
}
