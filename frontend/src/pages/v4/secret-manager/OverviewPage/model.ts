import type { DashboardProjectSecretsOverview } from "@app/hooks/api/dashboard/types";

export type ResourceKind =
  | "folder"
  | "secret"
  | "import"
  | "dynamic"
  | "rotation"
  | "honey"
  | "proxy";

type Overview = DashboardProjectSecretsOverview;
export type FolderEntry = NonNullable<Overview["folders"]>[number];
export type ImportEntry = NonNullable<Overview["imports"]>[number];
export type DynamicEntry = NonNullable<Overview["dynamicSecrets"]>[number];
export type RotationEntry = NonNullable<Overview["secretRotations"]>[number];
export type HoneyEntry = NonNullable<Overview["honeyTokens"]>[number];
export type ProxyEntry = NonNullable<Overview["proxiedServices"]>[number];
export type SecretEntry = NonNullable<Overview["secrets"]>[number];

export type Row =
  | { kind: "import"; key: string; name: string; entries: ImportEntry[] }
  | { kind: "folder"; key: string; name: string; entries: FolderEntry[] }
  | { kind: "dynamic"; key: string; name: string; entries: DynamicEntry[] }
  | { kind: "rotation"; key: string; name: string; entries: RotationEntry[] }
  | { kind: "honey"; key: string; name: string; entries: HoneyEntry[] }
  | { kind: "proxy"; key: string; name: string; entries: ProxyEntry[] }
  | { kind: "secret"; key: string; name: string; entries: SecretEntry[] };

export const filterKinds: { value: ResourceKind; rowType: string; label: string }[] = [
  { value: "secret", rowType: "secret", label: "Secrets" },
  { value: "folder", rowType: "folder", label: "Folders" },
  { value: "dynamic", rowType: "dynamic", label: "Dynamic secrets" },
  { value: "rotation", rowType: "rotation", label: "Secret rotations" },
  { value: "import", rowType: "import", label: "Secret imports" },
  { value: "honey", rowType: "honeyToken", label: "Honey tokens" },
  { value: "proxy", rowType: "proxiedService", label: "Proxied services" }
];

export const parseFilterBy = (filterBy?: string) =>
  filterKinds
    .filter((kind) => (filterBy ?? "").split(",").includes(kind.rowType))
    .map((kind) => kind.value);

export const serializeFilterBy = (kinds: ResourceKind[]) =>
  filterKinds
    .filter((kind) => kinds.includes(kind.value))
    .map((kind) => kind.rowType)
    .join(",") || undefined;

export const parseTags = (tags?: string) =>
  (tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export const environmentOf = {
  import: (entry: ImportEntry) => entry.environment ?? "",
  folder: (entry: FolderEntry) => entry.environment,
  dynamic: (entry: DynamicEntry) => entry.environment,
  rotation: (entry: RotationEntry) => entry.environment.slug,
  honey: (entry: HoneyEntry) => entry.environment.slug,
  proxy: (entry: ProxyEntry) => entry.environment.slug,
  secret: (entry: SecretEntry) => entry.env
};

const group = <T>(items: T[] | undefined, name: (item: T) => string) => {
  const groups = new Map<string, T[]>();
  (items ?? []).forEach((item) =>
    groups.set(name(item), [...(groups.get(name(item)) ?? []), item])
  );
  return [...groups.entries()];
};

export const toRows = (overview?: Overview): Row[] => {
  if (!overview) return [];
  return [
    ...group(overview.imports, (entry) => `${entry.importEnv.slug}:${entry.importPath}`).map(
      ([name, entries]): Row => ({ kind: "import", key: `import:${name}`, name, entries })
    ),
    ...group(overview.folders, (entry) => entry.name).map(([name, entries]): Row => ({
      kind: "folder",
      key: `folder:${name}`,
      name,
      entries
    })),
    ...group(overview.dynamicSecrets, (entry) => entry.name).map(([name, entries]): Row => ({
      kind: "dynamic",
      key: `dynamic:${name}`,
      name,
      entries
    })),
    ...group(overview.secretRotations, (entry) => entry.name).map(([name, entries]): Row => ({
      kind: "rotation",
      key: `rotation:${name}`,
      name,
      entries
    })),
    ...group(overview.honeyTokens, (entry) => entry.name).map(([name, entries]): Row => ({
      kind: "honey",
      key: `honey:${name}`,
      name,
      entries
    })),
    ...group(overview.proxiedServices, (entry) => entry.name).map(([name, entries]): Row => ({
      kind: "proxy",
      key: `proxy:${name}`,
      name,
      entries
    })),
    ...group(overview.secrets, (entry) => entry.key).map(([name, entries]): Row => ({
      kind: "secret",
      key: `secret:${name}`,
      name,
      entries
    }))
  ];
};

export const childPath = (path: string, name: string) => `${path === "/" ? "" : path}/${name}`;
