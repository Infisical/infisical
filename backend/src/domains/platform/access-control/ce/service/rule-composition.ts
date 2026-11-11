import { sortInvertedLast } from "./ability-builder";

// How permission layers combine. CASL lets the last matching rule decide, so the order rules end up in is the
// precedence between layers. Each helper names one ordering, so an owner composing its permission says which one it
// means instead of concatenating arrays by hand.

type TRule = { inverted?: boolean; conditions?: unknown };

// Roles held together: everything any of them allows, and any of them can deny. Cannot rules go last so a deny
// from one role is not undone by an allow from another.
export const mergeRoles = <T extends TRule>({ layers }: { layers: T[][] }): T[] => sortInvertedLast(layers.flat());

// A base layer with overrides that win wherever their conditions match: the overrides go after the base, so at the
// conditions they name they decide, and everywhere else the base still applies.
export const overrideAt = <T extends TRule>({ base, overrides }: { base: T[]; overrides: T[] }): T[] => [
  ...base,
  ...overrides
];

// Grants that each reset what is allowed under their own conditions (a secret folder at one path): every grant's
// deny block first, then every grant's allow block. Denies all come before allows so one grant's deny never undoes
// another grant's allow under the same conditions.
export const scopedGrants = <T extends TRule>({
  grants
}: {
  grants: { deny: T[]; allow: T[]; conditions: Record<string, unknown> }[];
}): T[] => {
  const withConditions = (rules: T[], conditions: Record<string, unknown>) =>
    rules.map((rule) => ({ ...rule, conditions }) as T);
  return [
    ...grants.flatMap(({ deny, conditions }) => withConditions(deny, conditions)),
    ...grants.flatMap(({ allow, conditions }) => withConditions(allow, conditions))
  ];
};

// Layers from the farthest scope to the closest (project, folder, account): the closest goes last, so it decides.
export const closestWins = <T extends TRule>({ layers }: { layers: T[][] }): T[] => layers.flat();

// Rules an actor gets on top of its own when a condition holds (a project admin on a resource it has no role on),
// added after them.
export const withFallback = <T extends TRule>({
  primary,
  fallback,
  when
}: {
  primary: T[];
  fallback: T[];
  when: boolean;
}): T[] => (when ? [...primary, ...fallback] : primary);
