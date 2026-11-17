import {
  EntityNotFoundError,
  ExternalSystemError,
  RuleViolationError,
  StateConflictError
} from "@app/domains/lib/errors";

import { RootKeyConfig, RootKeyEncryptionStrategy } from "./root-key-config";

const ROTATION_IN_PROGRESS =
  "An encryption key rotation is still in progress. Complete or discard it before changing the root key encryption strategy.";

const ALREADY_STAGED =
  "A key is already staged. Deploy that key, discard it, or retry with replaceStaged=true to replace it.";

// At most one staged and at most one retained copy next to the active one.
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

  // The newest one: what the cleanup and the operator's "previous key" mean.
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

  // Order matters: it keeps resolution deterministic when a key is rotated away and back (two rows then open with
  // the same key), and makes the steady state one decrypt, which under HSM is a device round trip.
  resolutionOrder(): RootKeyConfig[] {
    const sentinel = this.configs.filter((config) => config.isActive);
    const others = this.configs.filter((config) => !config.isActive);
    return [
      ...sentinel,
      ...others.filter((config) => !config.activatedAt),
      ...others.filter((config) => config.activatedAt)
    ];
  }

  // Null when `stagedId` is no longer staged (another pod promoted it first). The replaced key becomes the one
  // retained copy so pods that haven't rolled over can still boot. Older retained keys come back for removal.
  promote(
    stagedId: string,
    fallbackKekLabel: string | null,
    now: Date
  ): { active: RootKeyConfig; retained: RootKeyConfig; superseded: RootKeyConfig[] } | null {
    const staged = this.configs.find((config) => config.id === stagedId);
    if (!staged?.isStaged) return null;
    const { active } = this;
    if (!active) throw new ExternalSystemError({ message: "KMS root config is missing its active row" });

    const superseded = this.retainedNewestFirst();
    const retained = active.promote(staged, fallbackKekLabel, now);
    return { active, retained, superseded };
  }

  // A strategy change is a fleet-wide cutover: a pod holding the retained software copy would boot without the device.
  assertNoRotationInProgress(): void {
    if (this.staged || this.retained) throw new RuleViolationError({ message: ROTATION_IN_PROGRESS });
  }

  assertCanStage(replaceStaged: boolean): void {
    this.requireActive().assertRotatable();
    if (this.staged && !replaceStaged) throw new RuleViolationError({ message: ALREADY_STAGED });
  }

  // A running instance can apply a key staged when the request was read before the request gets its lock.
  assertStagedNotApplied(readEarlier: RootKeyRing): void {
    if (readEarlier.staged && !this.staged) {
      throw new StateConflictError({
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
        // The in-memory label covers an active row the boot backfill hasn't labelled yet.
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
