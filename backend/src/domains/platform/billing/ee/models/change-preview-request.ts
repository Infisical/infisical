import { RuleViolationError } from "@app/domains/lib/errors";

export type TCommitmentChange = { dimensionKey: string; quantity: number };

export type TChangePreviewRequestRecord = {
  addProductId?: string;
  removeProductId?: string;
  commitmentChanges?: TCommitmentChange[];
  upgradeProductId?: string;
  upgradePlan?: string;
};

// A subscription change to price before it is made: products to add, remove or move to another plan, and
// commitment changes.
export class ChangePreviewRequest {
  private constructor(private readonly record: TChangePreviewRequestRecord) {}

  static create(record: TChangePreviewRequestRecord): ChangePreviewRequest {
    const { addProductId, removeProductId, commitmentChanges, upgradeProductId, upgradePlan } = record;
    if (
      !addProductId &&
      !removeProductId &&
      !upgradeProductId &&
      !(commitmentChanges && commitmentChanges.length > 0)
    ) {
      throw new RuleViolationError({ message: "Provide a product to add, remove or upgrade, or a commitment change" });
    }
    if (upgradeProductId && !upgradePlan) {
      throw new RuleViolationError({ message: "Provide the plan to upgrade to" });
    }
    // A plan change already is a remove plus an add, so pairing it with either double-counts.
    if (upgradeProductId && (addProductId === upgradeProductId || removeProductId === upgradeProductId)) {
      throw new RuleViolationError({
        message: "A plan change cannot be combined with adding or removing the same product"
      });
    }
    return new ChangePreviewRequest({ ...record });
  }

  get addProductId(): string | undefined {
    return this.record.addProductId;
  }

  get upgrade(): { productId: string; plan: string } | undefined {
    const { upgradeProductId, upgradePlan } = this.record;
    return upgradeProductId && upgradePlan ? { productId: upgradeProductId, plan: upgradePlan } : undefined;
  }

  get removeProductIds(): string[] | undefined {
    return this.record.removeProductId ? [this.record.removeProductId] : undefined;
  }

  get commitmentChanges(): TCommitmentChange[] | undefined {
    const changes = this.record.commitmentChanges;
    return changes && changes.length > 0 ? changes : undefined;
  }
}
