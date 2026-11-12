export type V4Scheme = "light" | "dark";

export interface V4ThemeDefinition {
  id: string;
  name: string;
  scheme: V4Scheme;
  base?: V4Scheme;
  extends?: string;
  overrides: Readonly<Record<string, string>>;
}

export const legacyV4Themes: Readonly<Record<string, string>> = {
  light: "peach",
  dark: "dark",
  "dark-alt": "dark"
};

/** The theme and every theme it extends, nearest first, plus the base column the chain ends on. */
export const v4ThemeChain = (themes: readonly V4ThemeDefinition[], id: string) => {
  const chain: V4ThemeDefinition[] = [];
  let current = themes.find((theme) => theme.id === id);
  while (current) {
    if (chain.includes(current)) throw new Error(`Theme ${id} extends itself`);
    chain.push(current);
    if (current.base) return { chain, base: current.base };
    const parent = current.extends;
    current = themes.find((theme) => theme.id === parent);
    if (!current)
      throw new Error(`Theme ${chain[chain.length - 1].id} extends unknown theme ${parent}`);
  }
  throw new Error(`Unknown theme ${id}`);
};

/** A themed token's raw value in a theme: the nearest override, then the base column. */
export const v4ThemedValue = (
  themes: readonly V4ThemeDefinition[],
  id: string,
  name: string,
  value: Readonly<Record<string, string>>
) => {
  const { chain, base } = v4ThemeChain(themes, id);
  const override = chain.find((theme) => name in theme.overrides)?.overrides[name];
  return override ?? value[base] ?? value.light;
};
