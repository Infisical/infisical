import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";

import { RootKeyConfig, RootKeyEncryptionStrategy } from "./root-key-config";

const ROTATION_IN_PROGRESS =
  "An encryption key rotation is still in progress. Complete or discard it before changing the root key encryption strategy.";

const ALREADY_STAGED =
  "A key is already staged. Deploy that key, discard it, or retry with replaceStaged=true to replace it.";

// Every wrapped copy of the root key the database holds: the active one, at most one staged rotation and at most
// one retained key.
export class RootKeyRing {
  private constructor(private readonly configs: readonly RootKeyConfig[]) {}

  static of(configs: RootKeyConfig[]): RootKeyRing {
    return new RootKeyRing([...configs]);
  }

  get isEmpty(): boolean {
    return this.configs.length === 0;
  }

  get active(): RootKeyConfig | null {
    return this.configs.find((config) => config.isActive) ?? null;
  }

  get staged(): RootKeyConfig | null {
    return this.configs.find((config) => config.isStaged) ?? null;
  }

  // The newest retained key, the one the cleanup and the operator's "previous key" refer to.
  get retained(): RootKeyConfig | null {
    return this.retainedNewestFirst()[0] ?? null;
  }

  // A promotion keeps exactly one, so it removes every older one.
  retainedNewestFirst(): RootKeyConfig[] {
    return this.configs
      .filter((config) => config.isRetained)
      .sort((a, b) => (b.supersededAt as Date).getTime() - (a.supersededAt as Date).getTime());
  }

  requireActive(): RootKeyConfig {
    const { active } = this;
    if (!active) throw new EntityNotFoundError({ message: "KMS root config not found" });
    return active;
  }

  /**
   * The order matters twice: it keeps resolution deterministic when a key is rotated away from and later back
   * to (two rows then open with the same key), and it makes the steady state a single decrypt, which under HSM
   * is a device round trip.
   */
  resolutionOrder(): RootKeyConfig[] {
    const sentinel = this.configs.filter((config) => config.isActive);
    const others = this.configs.filter((config) => !config.isActive);
    return [
      ...sentinel,
      ...others.filter((config) => !config.activatedAt),
      ...others.filter((config) => config.activatedAt)
    ];
  }

  // A strategy change is a fleet-wide cutover: a pod holding the retained software copy would otherwise boot without
  // the device.
  assertNoRotationInProgress(): void {
    if (this.staged || this.retained) throw new RuleViolationError({ message: ROTATION_IN_PROGRESS });
  }

  assertCanStage(replaceStaged: boolean): void {
    this.requireActive().assertRotatable();
    if (this.staged && !replaceStaged) throw new RuleViolationError({ message: ALREADY_STAGED });
  }

  // A key staged when the request was read can be applied by a running instance before the request gets its lock.
  assertStagedNotApplied(readEarlier: RootKeyRing): void {
    if (readEarlier.staged && !this.staged) {
      throw new RuleViolationError({
        message:
          "The staged key was applied by a running instance while this request was in flight, so it cannot be replaced. There is no rollback once a rotation takes effect."
      });
    }
  }

  status(
    retentionDays: number,
    currentKekLabel: string | null
  ): {
    encryptionStrategy: RootKeyEncryptionStrategy | null;
    active: { label: string | null; activatedAt: Date };
    staged: { label: string | null; createdAt: Date } | null;
    expiring: { label: string | null; supersededAt: Date; lastResolvedAt: Date | null; expiresAt: Date } | null;
  } {
    const active = this.requireActive();
    const { staged, retained } = this;
    return {
      encryptionStrategy: active.strategy,
      active: {
        // The active row is the instance-wide answer; the in-memory label covers a row the boot backfill has not
        // labelled yet.
        label: active.kekLabel ?? currentKekLabel,
        activatedAt: active.activatedAt ?? active.createdAt
      },
      staged: staged ? { label: staged.kekLabel, createdAt: staged.createdAt } : null,
      expiring:
        retained?.supersededAt && retained.removalEligibleAt(retentionDays)
          ? {
              label: retained.kekLabel,
              supersededAt: retained.supersededAt,
              lastResolvedAt: retained.lastResolvedAt,
              expiresAt: retained.removalEligibleAt(retentionDays) as Date
            }
          : null
    };
  }
}
