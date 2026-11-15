import { RuleViolationError } from "@app/domains/lib/errors";

export type TEnvOverridesRecord = Record<string, string>;

export type TEnvOverrideGroups = Record<
  string,
  { name: string; fields: readonly { key: string; description?: string }[] }
>;

export type TOrganizedEnvOverrides = Record<
  string,
  { name: string; fields: { key: string; value: string; hasEnvEntry: boolean; description?: string }[] }
>;

// The env values an instance admin set, by env name. Only keys the env lets an admin override are kept.
export class EnvOverrides {
  private constructor(private readonly values: Readonly<TEnvOverridesRecord>) {}

  static none(): EnvOverrides {
    return new EnvOverrides({});
  }

  // Drops keys an admin cannot override, as applying them always has. Refuses the overrides when the env schema
  // rejects them; findIssues returns one readable line per rejected key.
  static create(
    raw: TEnvOverridesRecord,
    overridableKeys: ReadonlySet<string>,
    findIssues: (values: TEnvOverridesRecord) => string[]
  ): EnvOverrides {
    const values = Object.fromEntries(Object.entries(raw).filter(([key]) => overridableKeys.has(key)));
    const issues = findIssues(values);
    if (issues.length > 0) throw new RuleViolationError({ message: issues.join("\n") });
    return new EnvOverrides(values);
  }

  static restore(record: TEnvOverridesRecord): EnvOverrides {
    return new EnvOverrides({ ...record });
  }

  // The stored form: the JSON object, as every release has written it.
  static fromBytes(plainText: Buffer): EnvOverrides {
    return EnvOverrides.restore(JSON.parse(plainText.toString()) as TEnvOverridesRecord);
  }

  toBytes(): Buffer {
    return Buffer.from(JSON.stringify(this.values));
  }

  // The admin console's view: every overridable key by group, with its override ("" when none) and whether the
  // process env sets it.
  organize(groups: TEnvOverrideGroups, hasEnvValue: (key: string) => boolean): TOrganizedEnvOverrides {
    return Object.fromEntries(
      Object.entries(groups).map(([groupKey, group]) => [
        groupKey,
        {
          name: group.name,
          fields: group.fields.map(({ key, description }) => ({
            key,
            description,
            value: this.values[key] || "",
            hasEnvEntry: hasEnvValue(key)
          }))
        }
      ])
    );
  }

  toJSON(): TEnvOverridesRecord {
    return { ...this.values };
  }
}
