import { MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";

type TRawRule = RawRuleOf<MongoAbility>;

// The slug every scope stores for a custom role, and the one an additional privilege is read as.
const CUSTOM_SLUG = "custom";

export type TGrantRecord = {
  // The stored slug: a built-in role, or "custom" for a custom role or a privilege.
  slug: string;
  // The packed rules a custom role or privilege carries.
  packedRules?: unknown;
};

// One role or privilege an actor holds right now at a scope. What it grants is the scope owner's call: a built-in
// slug means whatever that owner's roles say, a custom one carries its own rules.
export class Grant {
  private constructor(
    private readonly slug: string,
    private readonly packedRules: unknown
  ) {}

  static restore({ slug, packedRules }: TGrantRecord): Grant {
    return new Grant(slug, packedRules);
  }

  isCustom(): boolean {
    return this.slug === CUSTOM_SLUG;
  }

  // Whether this is the built-in role with this slug. A custom role never is, whatever it is called.
  isBuiltIn(slug: string): boolean {
    return !this.isCustom() && this.slug === slug;
  }

  // The built-in slug, or null for a custom role or privilege.
  builtInSlug(): string | null {
    return this.isCustom() ? null : this.slug;
  }

  // The rules a custom role or privilege carries; none for a built-in role.
  customRules<TRule extends TRawRule = TRawRule>(): TRule[] {
    if (!this.isCustom()) return [];
    return unpackRules<TRule>((this.packedRules ?? []) as PackRule<TRule>[]);
  }

  toJSON(): TGrantRecord {
    return { slug: this.slug, packedRules: this.packedRules };
  }
}
