import { MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";

type TRawRule = RawRuleOf<MongoAbility>;

// Stored slug for every custom role. Additional privileges are read as custom too.
const CUSTOM_SLUG = "custom";

export type TGrantRecord = {
  // A built-in role slug, or "custom" for custom roles and privileges.
  slug: string;
  packedRules?: unknown;
};

// A built-in slug means whatever the scope owner's roles say it means. A custom grant carries its own rules.
export class Grant {
  private constructor(
    private readonly slug: string,
    private readonly packedRules: unknown
  ) {}

  static restore({ slug, packedRules }: TGrantRecord): Grant {
    return new Grant(slug, packedRules);
  }

  static custom(packedRules: unknown): Grant {
    return new Grant(CUSTOM_SLUG, packedRules);
  }

  isCustom(): boolean {
    return this.slug === CUSTOM_SLUG;
  }

  // A custom role never matches, whatever it's called.
  isBuiltIn(slug: string): boolean {
    return !this.isCustom() && this.slug === slug;
  }

  builtInSlug(): string | null {
    return this.isCustom() ? null : this.slug;
  }

  customRules<TRule extends TRawRule = TRawRule>(): TRule[] {
    if (!this.isCustom()) return [];
    return unpackRules<TRule>((this.packedRules ?? []) as PackRule<TRule>[]);
  }

  toJSON(): TGrantRecord {
    return { slug: this.slug, packedRules: this.packedRules };
  }
}
