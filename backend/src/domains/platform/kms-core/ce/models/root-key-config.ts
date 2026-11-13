import { randomUUID } from "node:crypto";

import { RuleViolationError } from "@app/domains/lib/errors";

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

const DAY_MS = 24 * 60 * 60 * 1000;

const ABANDONED_ROTATION_MAX_AGE_MS = 30 * DAY_MS;

// How recent a superseded-key boot has to be for the expiring-key delete to treat it as a live straggler and ask
// the operator to confirm. Shorter than the removal window: the weekly cleanup has nobody to make that judgement.
const STRAGGLER_EVIDENCE_WINDOW_MS = 60 * 60 * 1000;

const HSM_ROTATION_REFUSED =
  "This instance wraps its root key with an HSM, so there is no environment variable to rotate. Rotate the key on the HSM itself, or switch the encryption strategy to software first.";

export type TRootKeyConfigRecord = {
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
  private constructor(
    readonly id: string,
    private wrappedRootKey: Buffer,
    private strategyName: string | null,
    private label: string | null,
    private activatedOn: Date | null,
    private supersededOn: Date | null,
    private resolvedOn: Date | null,
    private readonly createdOn: Date,
    private readonly updatedOn: Date
  ) {}

  static restore(record: TRootKeyConfigRecord): RootKeyConfig {
    return new RootKeyConfig(
      record.id,
      record.encryptedRootKey,
      record.encryptionStrategy ?? null,
      record.kekLabel ?? null,
      record.activatedAt ?? null,
      record.supersededAt ?? null,
      record.lastResolvedAt ?? null,
      record.createdAt,
      record.updatedAt
    );
  }

  // The first root key of an instance. Migrations leave activatedAt unset: they run before the rotation columns exist.
  static bootstrap(input: {
    encryptedRootKey: Buffer;
    strategy: RootKeyEncryptionStrategy;
    withRotationState: boolean;
  }): RootKeyConfig {
    const now = new Date();
    return new RootKeyConfig(
      KMS_ROOT_CONFIG_UUID,
      input.encryptedRootKey,
      input.strategy,
      null,
      input.withRotationState ? now : null,
      null,
      null,
      now,
      now
    );
  }

  static stage(input: { encryptedRootKey: Buffer; kekLabel: string }): RootKeyConfig {
    const now = new Date();
    return new RootKeyConfig(
      randomUUID(),
      input.encryptedRootKey,
      RootKeyEncryptionStrategy.Software,
      input.kekLabel,
      null,
      null,
      null,
      now,
      now
    );
  }

  get isActive(): boolean {
    return this.id === KMS_ROOT_CONFIG_UUID;
  }

  get isStaged(): boolean {
    return !this.isActive && !this.activatedOn;
  }

  // The key a promotion replaced, still held for pods that have not rolled over.
  get isRetained(): boolean {
    return !this.isActive && Boolean(this.supersededOn);
  }

  get strategy(): RootKeyEncryptionStrategy | null {
    return (this.strategyName as RootKeyEncryptionStrategy) ?? null;
  }

  get encryptedRootKey(): Buffer {
    return this.wrappedRootKey;
  }

  get kekLabel(): string | null {
    return this.label;
  }

  get activatedAt(): Date | null {
    return this.activatedOn;
  }

  get supersededAt(): Date | null {
    return this.supersededOn;
  }

  get lastResolvedAt(): Date | null {
    return this.resolvedOn;
  }

  get createdAt(): Date {
    return this.createdOn;
  }

  // Later of supersededAt and lastResolvedAt plus retention; a straggler boot restarts the clock.
  removalEligibleAt(retentionDays: number): Date | null {
    if (!this.supersededOn) return null;
    const supersededAt = new Date(this.supersededOn).getTime();
    const lastResolvedAt = this.resolvedOn ? new Date(this.resolvedOn).getTime() : supersededAt;
    return new Date(Math.max(supersededAt, lastResolvedAt) + retentionDays * DAY_MS);
  }

  // lastResolvedAt can only prove presence: a straggler that never restarts leaves no stamp, so the retention
  // window covers it.
  isRemovalDue(now: Date, retentionDays: number): boolean {
    const eligibleAt = this.removalEligibleAt(retentionDays);
    return eligibleAt !== null && eligibleAt.getTime() <= now.getTime();
  }

  // A staged key nobody deployed for a month is a live working key that would promote itself if it reached a deployment.
  isAbandoned(now: Date): boolean {
    return this.isStaged && now.getTime() - new Date(this.createdOn).getTime() >= ABANDONED_ROTATION_MAX_AGE_MS;
  }

  assertRotatable(): void {
    if (this.strategy === RootKeyEncryptionStrategy.HSM)
      throw new RuleViolationError({ message: HSM_ROTATION_REFUSED });
  }

  // The operator names the key they mean, so a rotation staged or applied by someone else since they loaded the page
  // is never discarded or removed by mistake.
  assertNamed(label: string): void {
    if (this.label === label) return;
    if (this.isStaged) {
      throw new RuleViolationError({
        message: this.label
          ? `The staged encryption key is '${this.label}', not '${label}'. Someone else staged a key after you loaded this page. Re-read the current state before discarding.`
          : "The staged encryption key carries no label to match against, so it cannot be named. Restart the instance to record one, then retry."
      });
    }
    throw new RuleViolationError({
      message: this.label
        ? `The previous encryption key is '${this.label}', not '${label}'. Another rotation has taken effect since you loaded this page. Re-read the current state before removing it.`
        : "The previous encryption key carries no label to match against, so it cannot be named. Restart the instance to record one, then retry."
    });
  }

  /**
   * An instance that started on this key within the hour is very likely still running, and removing the key would
   * break its next restart. Nothing reports whether it rolled forward, so the operator confirms with `force`.
   * Returns whether `force` overrode that evidence, for the caller to log.
   */
  assertRemovable(now: Date, force: boolean): boolean {
    if (!this.resolvedOn) return false;
    const lastResolvedAt = new Date(this.resolvedOn).getTime();
    if (now.getTime() - lastResolvedAt >= STRAGGLER_EVIDENCE_WINDOW_MS) return false;
    if (!force) {
      throw new RuleViolationError({
        message: `An instance started on the previous encryption key at ${new Date(
          lastResolvedAt
        ).toISOString()} and may still be running. It would fail to restart if the key were removed now. Roll that instance onto the current key first, or retry with force=true to remove the key anyway.`
      });
    }
    return true;
  }

  // A software-wrapped active row written by a different key than this instance runs with cannot be rewrapped
  // here: the operator would be re-encrypting under a key that is not the one the database holds.
  assertWrittenWith(currentKekLabel: string | null): void {
    if (this.strategy !== RootKeyEncryptionStrategy.Software) return;
    if (this.label && currentKekLabel && this.label !== currentKekLabel) {
      throw new RuleViolationError({
        message: `This instance is running with encryption key label '${currentKekLabel}', but the active root key was written with '${this.label}'. Restart it with the current encryption key before changing the root key encryption strategy.`
      });
    }
  }

  // A strategy change prepares its wrapped key before the transaction, so it must find the row it read unchanged.
  assertWrappedAs(encryptedRootKey: Buffer): void {
    if (!this.wrappedRootKey.equals(encryptedRootKey)) {
      throw new RuleViolationError({
        message:
          "The active root key changed while this request was in flight, so the encryption strategy was left unchanged. Retry the change."
      });
    }
  }

  // The same root key under another strategy. Software carries the KEK label, HSM has none.
  rewrap(encryptedRootKey: Buffer, strategy: RootKeyEncryptionStrategy, currentKekLabel: string | null): void {
    this.wrappedRootKey = encryptedRootKey;
    this.strategyName = strategy;
    this.label = strategy === RootKeyEncryptionStrategy.Software ? currentKekLabel : null;
  }

  // Rows written before the label existed get it from the pod that can decrypt them, the only place it is derivable.
  // Returns whether anything changed.
  labelWith(kekLabel: string | null): boolean {
    if (this.label || !kekLabel) return false;
    this.label = kekLabel;
    return true;
  }

  // Only a retained copy is worth stamping: it is evidence a straggler still holds that key, which makes the cleanup
  // decline to remove it. Returns whether anything changed.
  recordResolution(now: Date): boolean {
    if (!this.supersededOn) return false;
    this.resolvedOn = now;
    return true;
  }

  // The retained copy a promotion leaves of the key it replaces.
  retainedCopy(now: Date): RootKeyConfig {
    return new RootKeyConfig(
      randomUUID(),
      this.wrappedRootKey,
      this.strategyName,
      this.label,
      this.activatedOn ?? this.createdOn,
      now,
      null,
      now,
      now
    );
  }

  /**
   * The moment a rotation takes effect: the active row takes the staged key's wrapped copy, strategy and label.
   * Returns the retained copy of the key it replaces, which the caller inserts so pods that have not rolled over
   * can still boot.
   */
  promote(staged: RootKeyConfig, fallbackKekLabel: string | null, now: Date): RootKeyConfig {
    if (!this.isActive) {
      throw new RuleViolationError({ message: "Only the active root key config can be replaced by a staged key." });
    }
    if (!staged.isStaged) {
      throw new RuleViolationError({ message: "Only a staged root key config can be promoted." });
    }

    const retained = this.retainedCopy(now);
    this.wrappedRootKey = staged.wrappedRootKey;
    this.strategyName = staged.strategyName ?? RootKeyEncryptionStrategy.Software;
    this.label = staged.label ?? fallbackKekLabel;
    this.activatedOn = now;
    this.supersededOn = null;
    return retained;
  }

  toJSON(): TRootKeyConfigRecord {
    return {
      id: this.id,
      encryptedRootKey: this.wrappedRootKey,
      encryptionStrategy: this.strategyName,
      kekLabel: this.label,
      activatedAt: this.activatedOn,
      supersededAt: this.supersededOn,
      lastResolvedAt: this.resolvedOn,
      createdAt: this.createdOn,
      updatedAt: this.updatedOn
    };
  }
}
