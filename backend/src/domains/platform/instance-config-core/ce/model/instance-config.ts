import { TSuperAdmin, TSuperAdminInsert } from "@app/db/schemas";

// The id of the one super_admin row. Pods of the previous release look the row up by it.
export const INSTANCE_CONFIG_ID = "00000000-0000-0000-0000-000000000000";

const ENCRYPTED_COLUMNS = [
  "encryptedSlackClientId",
  "encryptedSlackClientSecret",
  "encryptedMicrosoftTeamsAppId",
  "encryptedMicrosoftTeamsClientSecret",
  "encryptedMicrosoftTeamsBotId",
  "encryptedGitHubAppConnectionClientId",
  "encryptedGitHubAppConnectionClientSecret",
  "encryptedGitHubAppConnectionSlug",
  "encryptedGitHubAppConnectionId",
  "encryptedGitHubAppConnectionPrivateKey",
  "encryptedEnvOverrides"
] as const;

export type TEncryptedColumn = (typeof ENCRYPTED_COLUMNS)[number];

// The super_admin row with the default auth org fields its read joins in.
export type TInstanceConfigProps = TSuperAdmin & {
  defaultAuthOrgSlug: string | null;
  defaultAuthOrgAuthEnforced?: boolean | null;
  defaultAuthOrgAuthMethod?: string | null;
};

// What callers read: every setting, never a ciphertext.
export type TServerConfigView = Omit<TInstanceConfigProps, TEncryptedColumn>;

type TCachedBuffer = { type: "Buffer"; data: number[] } | Buffer | null | undefined;

// The row as JSON.parse returns it from the cache: dates are strings and Buffers are { type: "Buffer", data }.
export type TCachedInstanceConfig = Omit<TInstanceConfigProps, "createdAt" | "updatedAt" | TEncryptedColumn> & {
  createdAt: string | Date;
  updatedAt: string | Date;
} & Partial<Record<TEncryptedColumn, TCachedBuffer>>;

const reviveBuffer = (value: TCachedBuffer): Buffer | null => {
  if (!value) return null;
  return Buffer.isBuffer(value) ? value : Buffer.from(value.data);
};

// The instance's configuration: the single super_admin row.
export class InstanceConfig {
  private constructor(private readonly props: TInstanceConfigProps) {}

  static restore(props: TInstanceConfigProps): InstanceConfig {
    return new InstanceConfig({ ...props, defaultAuthOrgSlug: props.defaultAuthOrgSlug || null });
  }

  // A row read back from the cache, which pods of the previous release also write.
  static fromCached(cached: TCachedInstanceConfig): InstanceConfig {
    return InstanceConfig.restore({
      ...cached,
      createdAt: new Date(cached.createdAt),
      updatedAt: new Date(cached.updatedAt),
      encryptedSlackClientId: reviveBuffer(cached.encryptedSlackClientId),
      encryptedSlackClientSecret: reviveBuffer(cached.encryptedSlackClientSecret),
      encryptedMicrosoftTeamsAppId: reviveBuffer(cached.encryptedMicrosoftTeamsAppId),
      encryptedMicrosoftTeamsClientSecret: reviveBuffer(cached.encryptedMicrosoftTeamsClientSecret),
      encryptedMicrosoftTeamsBotId: reviveBuffer(cached.encryptedMicrosoftTeamsBotId),
      encryptedGitHubAppConnectionClientId: reviveBuffer(cached.encryptedGitHubAppConnectionClientId),
      encryptedGitHubAppConnectionClientSecret: reviveBuffer(cached.encryptedGitHubAppConnectionClientSecret),
      encryptedGitHubAppConnectionSlug: reviveBuffer(cached.encryptedGitHubAppConnectionSlug),
      encryptedGitHubAppConnectionId: reviveBuffer(cached.encryptedGitHubAppConnectionId),
      encryptedGitHubAppConnectionPrivateKey: reviveBuffer(cached.encryptedGitHubAppConnectionPrivateKey),
      encryptedEnvOverrides: reviveBuffer(cached.encryptedEnvOverrides)
    });
  }

  // The row a new instance starts with.
  static initial({ fipsEnabled }: { fipsEnabled: boolean }): TSuperAdminInsert & { id: string } {
    return { id: INSTANCE_CONFIG_ID, fipsEnabled, initialized: false, allowSignUp: true, defaultAuthOrgId: null };
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

  toView(): TServerConfigView {
    const {
      encryptedSlackClientId,
      encryptedSlackClientSecret,
      encryptedMicrosoftTeamsAppId,
      encryptedMicrosoftTeamsClientSecret,
      encryptedMicrosoftTeamsBotId,
      encryptedGitHubAppConnectionClientId,
      encryptedGitHubAppConnectionClientSecret,
      encryptedGitHubAppConnectionSlug,
      encryptedGitHubAppConnectionId,
      encryptedGitHubAppConnectionPrivateKey,
      encryptedEnvOverrides,
      ...view
    } = this.props;
    return view;
  }

  // The full row, the shape the shared cache has always held.
  toJSON(): TInstanceConfigProps {
    return { ...this.props };
  }
}
