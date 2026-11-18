export type TRuleIdentityRecord = {
  id: string;
  // The user's username or the identity's name; empty when unknown.
  username: string;
  metadata: Record<string, string>;
  // What the identity authenticated with; only known for the identity making the request.
  auth?: Record<string, unknown> | null;
};

// A placeholder nobody filled renders back as itself (`{{identity.metadata.team}}`), so a condition on a missing
// attribute matches nothing instead of an empty string.
const keepMissingPlaceholders = <T extends Record<string, unknown>>(values: T, path: string): T =>
  new Proxy(
    { ...values },
    {
      get(target: Record<string, unknown>, prop: string | symbol) {
        if (typeof prop !== "string") return Reflect.get(target, prop) as unknown;
        if (!Object.hasOwn(target, prop)) {
          // eslint-disable-next-line no-param-reassign
          target[prop] = `{{${path}.${prop}}}`;
        }
        return target[prop];
      }
    }
  ) as T;

// What `{{identity.*}}` placeholders in a custom role or privilege resolve to for one actor.
export class RuleIdentity {
  private constructor(
    private readonly id: string,
    private readonly username: string,
    private readonly metadata: Record<string, string>,
    private readonly auth: Record<string, unknown> | null
  ) {}

  static create({ id, username, metadata, auth }: TRuleIdentityRecord): RuleIdentity {
    return new RuleIdentity(id, username, { ...metadata }, auth ? { ...auth } : null);
  }

  toContext(): Record<string, unknown> {
    return {
      identity: {
        id: this.id,
        username: this.username,
        metadata: keepMissingPlaceholders(this.metadata, "identity.metadata"),
        auth: this.auth ? keepMissingPlaceholders(this.auth, "identity.auth") : {}
      }
    };
  }
}
