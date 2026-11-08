import { randomUUID } from "node:crypto";

export enum RootKeyEncryptionStrategy {
  Software = "SOFTWARE",
  HSM = "HSM"
}

/**
 * The row holding the currently active wrapped root key. A compatibility handle: a version predating
 * rotation looks this id up and knows nothing about staged or retained rows, so keeping the active key here
 * is what lets it boot. New code finds rows by trial decryption.
 */
export const KMS_ROOT_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

export type TRootKeyConfigProps = {
  id: string;
  encryptedRootKey: Buffer;
  encryptionStrategy?: string | null;
  kekLabel?: string | null;
  // Null on a staged row that no pod has promoted yet.
  activatedAt?: Date | null;
  // Set on a retained row: the key a promotion replaced, kept so pods not yet rolled over can boot.
  supersededAt?: Date | null;
  lastResolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// One wrapped copy of the root key: the active one (KMS_ROOT_CONFIG_UUID), a staged rotation, or a retained key.
export class RootKeyConfig {
  private constructor(private readonly props: TRootKeyConfigProps) {}

  static restore(props: TRootKeyConfigProps): RootKeyConfig {
    return new RootKeyConfig(props);
  }

  // The first root key of an instance. Migrations leave activatedAt unset: they run before the rotation columns exist.
  static bootstrap(input: {
    encryptedRootKey: Buffer;
    strategy: RootKeyEncryptionStrategy;
    withRotationState: boolean;
  }): RootKeyConfig {
    const now = new Date();
    return new RootKeyConfig({
      id: KMS_ROOT_CONFIG_UUID,
      encryptedRootKey: input.encryptedRootKey,
      encryptionStrategy: input.strategy,
      ...(input.withRotationState ? { activatedAt: now } : {}),
      createdAt: now,
      updatedAt: now
    });
  }

  static stage(input: { encryptedRootKey: Buffer; kekLabel: string }): RootKeyConfig {
    const now = new Date();
    return new RootKeyConfig({
      id: randomUUID(),
      encryptedRootKey: input.encryptedRootKey,
      encryptionStrategy: RootKeyEncryptionStrategy.Software,
      kekLabel: input.kekLabel,
      activatedAt: null,
      createdAt: now,
      updatedAt: now
    });
  }

  /**
   * The order matters twice: it keeps resolution deterministic when a key is rotated away from and later back
   * to (two rows then open with the same key), and it makes the steady state a single decrypt, which under HSM
   * is a device round trip.
   */
  static orderForResolution(rows: RootKeyConfig[]): RootKeyConfig[] {
    const sentinel = rows.filter((row) => row.isActive);
    const others = rows.filter((row) => !row.isActive);
    return [...sentinel, ...others.filter((row) => !row.activatedAt), ...others.filter((row) => row.activatedAt)];
  }

  // Later of supersededAt and lastResolvedAt plus retention; a straggler boot restarts the clock.
  static removalEligibleAt(row: { supersededAt: Date; lastResolvedAt?: Date | null }, retentionDays: number): Date {
    const supersededAt = new Date(row.supersededAt).getTime();
    const lastResolvedAt = row.lastResolvedAt ? new Date(row.lastResolvedAt).getTime() : supersededAt;
    return new Date(Math.max(supersededAt, lastResolvedAt) + retentionDays * 24 * 60 * 60 * 1000);
  }

  get id(): string {
    return this.props.id;
  }

  get isActive(): boolean {
    return this.props.id === KMS_ROOT_CONFIG_UUID;
  }

  get isStaged(): boolean {
    return !this.isActive && !this.props.activatedAt;
  }

  get strategy(): RootKeyEncryptionStrategy | null {
    return (this.props.encryptionStrategy as RootKeyEncryptionStrategy) ?? null;
  }

  get encryptedRootKey(): Buffer {
    return this.props.encryptedRootKey;
  }

  get kekLabel(): string | null {
    return this.props.kekLabel ?? null;
  }

  get activatedAt(): Date | null {
    return this.props.activatedAt ?? null;
  }

  get supersededAt(): Date | null {
    return this.props.supersededAt ?? null;
  }

  get lastResolvedAt(): Date | null {
    return this.props.lastResolvedAt ?? null;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  removalEligibleAt(retentionDays: number): Date | null {
    const { supersededAt } = this.props;
    if (!supersededAt) return null;
    return RootKeyConfig.removalEligibleAt({ supersededAt, lastResolvedAt: this.props.lastResolvedAt }, retentionDays);
  }

  // The retained copy a promotion leaves of the key it replaces.
  retainedCopy(now: Date): RootKeyConfig {
    return new RootKeyConfig({
      id: randomUUID(),
      encryptedRootKey: this.props.encryptedRootKey,
      encryptionStrategy: this.props.encryptionStrategy,
      kekLabel: this.props.kekLabel,
      activatedAt: this.props.activatedAt ?? this.props.createdAt,
      supersededAt: now,
      lastResolvedAt: null,
      createdAt: now,
      updatedAt: now
    });
  }

  toJSON(): TRootKeyConfigProps {
    return this.props;
  }
}
