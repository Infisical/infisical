/**
 * A very small argument parser, written because the ad-hoc filtering it replaces was wrong.
 *
 * The old approach dropped any argument whose predecessor started with `--`, on the assumption
 * that it was that flag's value. That works for `--diff <path>` and silently breaks for boolean
 * flags: `run --live folder` discarded `folder` and walked the entire registry instead of the one
 * guide asked for. Failing by doing more work than requested is the worst shape of that bug,
 * because nothing looks wrong in the output.
 *
 * The fix is simply to know which flags take a value.
 */

export type ParsedArgs = {
  /** Everything that is not a flag or a flag's value, in order. */
  positionals: string[];
  /** True when a boolean flag was passed. */
  has: (flag: string) => boolean;
  /** The value of a value-taking flag, or null. */
  value: (flag: string) => string | null;
  /** Flags that were passed but are not known to this command. */
  unknown: string[];
};

export const parseArgs = (
  argv: string[],
  spec: { valueFlags?: string[]; booleanFlags?: string[] } = {}
): ParsedArgs => {
  const valueFlags = new Set(spec.valueFlags ?? []);
  const booleanFlags = new Set(spec.booleanFlags ?? []);

  const positionals: string[] = [];
  const booleans = new Set<string>();
  const values = new Map<string, string>();
  const unknown: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    // Support both `--flag value` and `--flag=value`.
    const equals = arg.indexOf("=");
    const name = equals >= 0 ? arg.slice(0, equals) : arg;
    const inlineValue = equals >= 0 ? arg.slice(equals + 1) : null;

    if (valueFlags.has(name)) {
      if (inlineValue !== null) {
        values.set(name, inlineValue);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          values.set(name, next);
          i += 1;
        }
      }
      continue;
    }

    if (booleanFlags.has(name)) {
      booleans.add(name);
      continue;
    }

    unknown.push(name);
  }

  return {
    positionals,
    has: (flag) => booleans.has(flag),
    value: (flag) => values.get(flag) ?? null,
    unknown
  };
};
