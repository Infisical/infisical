import {
  PermissionConditionOperators,
  ProjectPermissionActions,
  ProjectPermissionAgentVaultServiceActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ProjectMembershipRole, TProjectPermission } from "@app/hooks/api/roles/types";

import {
  AGENT_VAULT_SESSION_SELF,
  CUSTOM_LEVEL,
  DENIED_LEVEL,
  NONE_LEVEL,
  PERMISSION_ROWS,
  RESOURCE_NOUNS,
  SessionEveryoneAction,
  SUBJECT_RULES,
  SUBJECTS_WITHOUT_DENY,
  TActionSets,
  TAgentVaultPolicy,
  TPermissionAction,
  TPermissionRow,
  TPermissionRowKey,
  TPermissionScope,
  TResourcePermissions,
  TResourceRowKey
} from "./agentVaultPermissionCatalog";

export * from "./agentVaultPermissionCatalog";

// Access bundles and skills take the same action names as services.
const ResourceAction = ProjectPermissionAgentVaultServiceActions;
const SessionAction = ProjectPermissionAgentVaultSessionActions;
const Sub = ProjectPermissionSub;

const ROWS_BY_KEY = new Map(PERMISSION_ROWS.map((row) => [row.key, row]));

export const getPermissionRow = (rowKey: TPermissionRowKey) =>
  ROWS_BY_KEY.get(rowKey) as TPermissionRow;

export const isResourceRowKey = (rowKey: TPermissionRowKey): rowKey is TResourceRowKey =>
  rowKey === "accessBundles" || rowKey === "services" || rowKey === "skills";

const ownerId = (subject: string, action: string) => `${subject}|${action}`;

type TActionOwner = { rowKey: TPermissionRowKey; action: TPermissionAction };

// Actions that need one on another subject. Assigning roles works only for someone who can see the roles to pick from,
// so allowing it also allows viewing roles.
const CROSS_SUBJECT_NEEDS = new Map<string, string[]>(
  [ProjectPermissionSub.Member, ProjectPermissionSub.Groups, ProjectPermissionSub.Identity].map(
    (subject) => [
      ownerId(subject, ProjectPermissionMemberActions.AssignRole),
      [ownerId(ProjectPermissionSub.Role, ProjectPermissionActions.Read)]
    ]
  )
);

const ACTION_OWNERS = new Map<string, TActionOwner>(
  PERMISSION_ROWS.flatMap((row) =>
    row.actions.map(
      (action) => [ownerId(action.subject, action.action), { rowKey: row.key, action }] as const
    )
  )
);

const actionOf = (rowKey: TPermissionRowKey, key: string) =>
  getPermissionRow(rowKey).actions.find((action) => action.key === key);

const unique = <T>(values: T[]) => [...new Set(values)];

const isSameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value) => b.includes(value));

const isSubset = (a: string[], b: string[]) => a.every((value) => b.includes(value));

const without = (values: string[], removed: string[]) =>
  values.filter((value) => !removed.includes(value));

const directPrerequisites = (subject: ProjectPermissionSub, action: string) => {
  const rules = SUBJECT_RULES[subject];
  const { readAction } = rules ?? {};
  return unique([
    ...(rules?.requires?.[action] ?? []),
    ...(readAction && readAction !== action ? [readAction] : [])
  ]);
};

const allPrerequisites = (subject: ProjectPermissionSub, action: string): string[] => {
  const found: string[] = [];
  const visit = (current: string) =>
    directPrerequisites(subject, current).forEach((needed) => {
      if (found.includes(needed)) return;
      found.push(needed);
      visit(needed);
    });
  visit(action);
  return found;
};

const subjectActions = (subject: ProjectPermissionSub) =>
  PERMISSION_ROWS.flatMap((row) =>
    row.actions.filter((action) => action.subject === subject).map(({ action }) => action)
  );

const allDependents = (subject: ProjectPermissionSub, action: string) =>
  subjectActions(subject).filter((other) => allPrerequisites(subject, other).includes(action));

const emptySets = (): TActionSets => ({ allow: [], deny: [] });

/** A policy that grants nothing. A role holds exactly its own rules, so this is what a blank role can do. */
export const createEmptyAgentVaultPolicy = (): TAgentVaultPolicy => ({
  accessBundles: { ...emptySets(), items: [] },
  services: { ...emptySets(), items: [] },
  skills: { ...emptySets(), items: [] },
  sessions: emptySets(),
  inlineServices: emptySets(),
  inlineSkills: emptySets(),
  delegations: emptySets(),
  variables: emptySets(),
  proxies: emptySets(),
  hooks: emptySets(),
  members: emptySets(),
  roles: emptySets(),
  appConnections: emptySets(),
  sessionLogSettings: emptySets(),
  auditLogs: emptySets(),
  project: emptySets()
});

const itemKeysOf = (rowKey: TResourceRowKey) =>
  getPermissionRow(rowKey)
    .actions.filter((action) => !action.isAllOnly)
    .map(({ key }) => key);

const orderKeys = (rowKey: TPermissionRowKey, keys: string[]) =>
  getPermissionRow(rowKey)
    .actions.map(({ key }) => key)
    .filter((key) => keys.includes(key));

const getSets = (policy: TAgentVaultPolicy, scope: TPermissionScope): TActionSets => {
  if (scope.itemId && isResourceRowKey(scope.rowKey)) {
    return policy[scope.rowKey].items.find((item) => item.id === scope.itemId) ?? emptySets();
  }
  return policy[scope.rowKey];
};

const withSets = (
  policy: TAgentVaultPolicy,
  scope: TPermissionScope,
  { allow, deny }: TActionSets
): TAgentVaultPolicy => {
  const sets = { allow: orderKeys(scope.rowKey, allow), deny: orderKeys(scope.rowKey, deny) };
  if (scope.itemId && isResourceRowKey(scope.rowKey)) {
    const resource = policy[scope.rowKey];
    return {
      ...policy,
      [scope.rowKey]: {
        ...resource,
        items: resource.items.map((item) =>
          item.id === scope.itemId ? { ...item, ...sets } : item
        )
      }
    };
  }
  return { ...policy, [scope.rowKey]: { ...policy[scope.rowKey], ...sets } } as TAgentVaultPolicy;
};

// The scope that holds another action of the same subject: the same bundle, service or skill, or the row that shows it.
const relatedScope = (scope: TPermissionScope, owner: TActionOwner): TPermissionScope =>
  owner.rowKey === scope.rowKey ? scope : { rowKey: owner.rowKey };

// An action with what it needs, or with what needs it. Within one bundle, service or skill, actions that only hold for
// all of them are left out.
const withRelated = (
  scope: TPermissionScope,
  key: string,
  pick: "needs" | "neededBy"
): TActionOwner[] => {
  const action = actionOf(scope.rowKey, key);
  if (!action) return [];
  const related =
    pick === "needs"
      ? allPrerequisites(action.subject, action.action)
      : allDependents(action.subject, action.action);
  const crossSubject =
    pick === "needs" ? (CROSS_SUBJECT_NEEDS.get(ownerId(action.subject, action.action)) ?? []) : [];
  return [
    { rowKey: scope.rowKey, action },
    ...related.flatMap((name) => ACTION_OWNERS.get(ownerId(action.subject, name)) ?? []),
    ...crossSubject.flatMap((id) => ACTION_OWNERS.get(id) ?? [])
  ].filter((owner) => !(scope.itemId && owner.action.isAllOnly));
};

// The API refuses a rule that holds the legacy action beside one that replaced it. Checks accept either, and a deny of
// a newer action already denies the legacy one, so allowing it reads as allowing every replacement and denying it
// beside a replacement adds nothing.
const canonicalLegacy = (rowKey: TPermissionRowKey, sets: TActionSets): TActionSets => {
  let { allow, deny } = sets;
  getPermissionRow(rowKey).actions.forEach((action) => {
    const legacy = SUBJECT_RULES[action.subject]?.legacy;
    if (!legacy || legacy.action !== action.action) return;
    const replacements = legacy.replacedBy.flatMap(
      (name) => ACTION_OWNERS.get(ownerId(action.subject, name))?.action.key ?? []
    );
    if (allow.includes(action.key) && replacements.some((key) => allow.includes(key))) {
      allow = unique([...without(allow, [action.key]), ...replacements]);
    }
    if (deny.includes(action.key) && replacements.some((key) => deny.includes(key))) {
      deny = without(deny, [action.key]);
    }
  });
  return { allow, deny };
};

const withImpliedRead = (keys: string[]) =>
  keys.includes(ResourceAction.Use) ? unique([...keys, ResourceAction.Read]) : keys;

// Where use is denied, read that only came with it stays implied: writing it would let the bundle, service or skill be
// read, which it couldn't be while only use was allowed.
const withReadImpliedUnlessUseDenied = (keys: string[], isUseDenied: boolean) =>
  isUseDenied ? keys : withImpliedRead(keys);

const normalizeSets = (rowKey: TPermissionRowKey, sets: TActionSets): TActionSets => {
  const canonical = canonicalLegacy(rowKey, sets);
  return {
    allow: orderKeys(rowKey, canonical.allow),
    deny: orderKeys(rowKey, canonical.deny)
  };
};

const normalizeResource = (
  rowKey: TResourceRowKey,
  resource: TResourcePermissions
): TResourcePermissions => {
  const itemKeys = itemKeysOf(rowKey);
  const merged = new Map<string, TActionSets>();
  resource.items.forEach(({ id, allow, deny }) => {
    const existing = merged.get(id) ?? emptySets();
    merged.set(id, { allow: [...existing.allow, ...allow], deny: [...existing.deny, ...deny] });
  });

  // Read that every one of them has only because use does, where use is denied for all of them or for one, which then
  // can't be read either. Writing read for every one of them would let those be read, and denying read would override
  // another role that lets the member read them, so the rules keep only use, as they came.
  const keepsReadImplied =
    resource.allow.includes(ResourceAction.Use) &&
    !resource.allow.includes(ResourceAction.Read) &&
    (resource.deny.includes(ResourceAction.Use) ||
      [...merged.values()].some(
        (sets) =>
          sets.deny.includes(ResourceAction.Use) && !sets.allow.includes(ResourceAction.Read)
      ));
  const all = normalizeSets(rowKey, {
    allow: keepsReadImplied ? resource.allow : withImpliedRead(resource.allow),
    deny: resource.deny
  });
  const inherited = all.allow.filter((key) => itemKeys.includes(key));

  // An item keeps only what it adds to every one of them. Holding copies of what it inherits would keep those
  // actions on it after every one of them is lowered.
  const items = [...merged]
    .map(([id, sets]) => ({
      id,
      allow: orderKeys(
        rowKey,
        without(
          withReadImpliedUnlessUseDenied(
            sets.allow,
            sets.deny.includes(ResourceAction.Use) || all.deny.includes(ResourceAction.Use)
          ),
          inherited
        ).filter((key) => itemKeys.includes(key))
      ),
      deny: orderKeys(
        rowKey,
        without(sets.deny, all.deny).filter((key) => itemKeys.includes(key))
      )
    }))
    .filter((item) => item.deny.length > 0 || item.allow.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  return { ...all, items };
};

const actionsOfSubject = (
  policy: TAgentVaultPolicy,
  subject: ProjectPermissionSub,
  effect: keyof TActionSets
) =>
  PERMISSION_ROWS.flatMap((row) =>
    row.actions
      .filter(
        (action) => action.subject === subject && policy[row.key][effect].includes(action.key)
      )
      .map(({ action }) => action)
  );

/**
 * Drops each hidden allow on a subject the policy allows nothing shown on, so a role the editor shows as granting
 * nothing on a subject grants nothing there, and taking off the last row on it takes the hidden actions too. Hidden
 * denies stay, since dropping one could only widen a role.
 */
export const withoutLoneHiddenAllows = (policy: TAgentVaultPolicy): TAgentVaultPolicy => {
  if (!policy.hidden?.length) return policy;
  const hidden = policy.hidden.filter(
    ({ subject, inverted }) => inverted || actionsOfSubject(policy, subject, "allow").length > 0
  );
  if (hidden.length === policy.hidden.length) return policy;
  return { ...policy, hidden: hidden.length ? hidden : undefined };
};

/**
 * The one form every policy that grants the same thing takes: actions in catalog order, read held wherever use is, and
 * a bundle, service or skill listed with what it adds to every one of them or denies, and left out when that is
 * nothing.
 */
export const normalizeAgentVaultPolicy = (policy: TAgentVaultPolicy): TAgentVaultPolicy => {
  const normalized = createEmptyAgentVaultPolicy();
  PERMISSION_ROWS.forEach((row) => {
    if (isResourceRowKey(row.key)) {
      normalized[row.key] = normalizeResource(row.key, policy[row.key]);
    } else {
      normalized[row.key] = normalizeSets(row.key, policy[row.key]);
    }
  });
  if (policy.hidden?.length) normalized.hidden = policy.hidden;
  return withoutLoneHiddenAllows(normalized);
};

const SUBJECT_ORDER = unique(
  PERMISSION_ROWS.flatMap((row) => row.actions.map(({ subject }) => subject))
);

// The API refuses a condition that names more ids than this (AGENT_VAULT_MAX_IDS_PER_CONDITION on the backend), so a
// group that names more is written as several rules.
export const AGENT_VAULT_MAX_IDS_PER_CONDITION = 1000;

// The API refuses a role that names more ids than this across all its rules (AGENT_VAULT_MAX_ROLE_IDS on the backend),
// and the editor draws a row per id, so a role past it is shown as JSON only.
export const AGENT_VAULT_MAX_ROLE_IDS = 2000;

const idsInCondition = (condition: unknown): number => {
  if (typeof condition === "string") return 1;
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return 0;
  const { $eq, $in } = condition as { $eq?: unknown; $in?: unknown };
  return (typeof $eq === "string" ? 1 : 0) + (Array.isArray($in) ? $in.length : 0);
};

export const countAgentVaultRuleIds = (rules: TProjectPermission[]) =>
  rules.reduce((total, rule) => {
    const { conditions } = rule as { conditions?: unknown };
    if (!conditions || typeof conditions !== "object" || Array.isArray(conditions)) return total;
    return (
      total +
      Object.values(conditions as Record<string, unknown>).reduce<number>(
        (sum, c) => sum + idsInCondition(c),
        0
      )
    );
  }, 0);

export const tooManyRoleIdsMessage = (count: number) =>
  `This role names ${count} IDs across its rules, and a role can name at most ${AGENT_VAULT_MAX_ROLE_IDS}. Give it every item of a kind instead of listing them, or split it in two.`;

const groupedRules = (
  subject: ProjectPermissionSub,
  field: string,
  rowKey: TResourceRowKey,
  entries: { id: string; keys: string[] }[],
  isInverted: boolean
): TProjectPermission[] => {
  const groups = new Map<string, { keys: string[]; ids: string[] }>();
  const order = getPermissionRow(rowKey).actions.map(({ key }) => key);
  entries.forEach(({ id, keys }) => {
    if (!keys.length) return;
    const signature = keys.map((key) => order.indexOf(key)).join(",");
    const group = groups.get(signature) ?? { keys, ids: [] };
    group.ids.push(id);
    groups.set(signature, group);
  });

  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, { keys, ids }]) => {
      const sorted = [...ids].sort();
      return Array.from(
        { length: Math.ceil(sorted.length / AGENT_VAULT_MAX_IDS_PER_CONDITION) },
        (_, chunk) => ({
          subject,
          action: keys,
          ...(isInverted ? { inverted: true } : {}),
          conditions: {
            [field]: {
              [PermissionConditionOperators.$IN]: sorted.slice(
                chunk * AGENT_VAULT_MAX_IDS_PER_CONDITION,
                (chunk + 1) * AGENT_VAULT_MAX_IDS_PER_CONDITION
              )
            }
          }
        })
      );
    });
};

// The session actions the editor lists twice, for the caller's own sessions and for everyone's, keyed by the action.
const EVERYONE_KEY_OF: Record<string, string> = {
  [SessionAction.Read]: SessionEveryoneAction.Read,
  [SessionAction.Edit]: SessionEveryoneAction.Edit,
  [SessionAction.Revoke]: SessionEveryoneAction.Revoke
};
const EVERYONE_KEYS: string[] = Object.values(EVERYONE_KEY_OF);
const ACTOR_ACTIONS = Object.keys(EVERYONE_KEY_OF);

const sessionRule = (
  actions: string[],
  isInverted: boolean,
  operator?: PermissionConditionOperators.$EQ | PermissionConditionOperators.$NEQ
): TProjectPermission[] =>
  actions.length
    ? [
        {
          subject: Sub.AgentVaultSessions,
          action: actions,
          ...(isInverted ? { inverted: true } : {}),
          ...(operator ? { conditions: { actorId: { [operator]: AGENT_VAULT_SESSION_SELF } } } : {})
        } as TProjectPermission
      ]
    : [];

// Writes the editor's session keys as the API takes them: an action on the caller's own sessions and on everyone's
// takes no condition, on their own alone is limited to them ($eq), and on everyone's alone to sessions other people
// started ($ne). Allows and denies alike.
const toApiSessionRules = (rule: TProjectPermission): TProjectPermission[] => {
  const {
    subject: ruleSubject,
    action,
    inverted
  } = rule as {
    subject: string;
    action: string | string[];
    inverted?: boolean;
  };
  if (ruleSubject !== Sub.AgentVaultSessions) return [rule];
  const keys = typeof action === "string" ? [action] : action;
  const isInverted = Boolean(inverted);
  const hasOwn = (name: string) => keys.includes(name);
  const hasEveryone = (name: string) => keys.includes(EVERYONE_KEY_OF[name]);
  return [
    ...sessionRule(
      [
        ...keys.filter((key) => !EVERYONE_KEYS.includes(key) && !ACTOR_ACTIONS.includes(key)),
        ...ACTOR_ACTIONS.filter((name) => hasOwn(name) && hasEveryone(name))
      ],
      isInverted
    ),
    ...sessionRule(
      ACTOR_ACTIONS.filter((name) => hasOwn(name) && !hasEveryone(name)),
      isInverted,
      PermissionConditionOperators.$EQ
    ),
    ...sessionRule(
      ACTOR_ACTIONS.filter((name) => !hasOwn(name) && hasEveryone(name)),
      isInverted,
      PermissionConditionOperators.$NEQ
    )
  ];
};

/**
 * The fewest rules that say exactly what the policy does, always written the same way: per subject one allow and one
 * deny, and for bundles, services and skills one rule per distinct set of extra actions and of denied actions.
 */
export const policyToRules = (policy: TAgentVaultPolicy): TProjectPermission[] => {
  const normalized = normalizeAgentVaultPolicy(policy);

  return SUBJECT_ORDER.flatMap((subject) => {
    const rules: TProjectPermission[] = [];
    const resourceKey = PERMISSION_ROWS.find(
      (row) => isResourceRowKey(row.key) && row.actions[0].subject === subject
    )?.key as TResourceRowKey | undefined;
    const field = SUBJECT_RULES[subject]?.idField;

    const allowed = actionsOfSubject(normalized, subject, "allow");
    if (allowed.length) rules.push({ subject, action: allowed });
    if (resourceKey && field) {
      const resource = normalized[resourceKey];
      rules.push(
        ...groupedRules(
          subject,
          field,
          resourceKey,
          resource.items.map((item) => ({
            id: item.id,
            keys: orderKeys(
              resourceKey,
              withReadImpliedUnlessUseDenied(
                without(item.allow, resource.allow),
                item.deny.includes(ResourceAction.Use) || resource.deny.includes(ResourceAction.Use)
              )
            )
          })),
          false
        )
      );
    }

    const denied = SUBJECTS_WITHOUT_DENY.has(subject)
      ? []
      : actionsOfSubject(normalized, subject, "deny");
    if (denied.length) rules.push({ subject, action: denied, inverted: true });
    if (resourceKey && field) {
      rules.push(
        ...groupedRules(
          subject,
          field,
          resourceKey,
          normalized[resourceKey].items.map((item) => ({ id: item.id, keys: item.deny })),
          true
        )
      );
    }

    return rules;
  })
    .concat(
      (normalized.hidden ?? []).map(({ subject, action, inverted }) => ({
        subject,
        action,
        ...(inverted ? { inverted } : {})
      }))
    )
    .flatMap(toApiSessionRules);
};

export type TUnsupportedRule = { rule: TProjectPermission; reason: string };

export type TParsedAgentVaultPolicy = {
  policy: TAgentVaultPolicy;
  unsupported: TUnsupportedRule[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type TNormalizedRule = {
  subject: string;
  actions: string[];
  conditions?: Record<string, unknown>;
  isInverted: boolean;
};

const normalizeRule = (rule: unknown): TNormalizedRule | string => {
  if (!isPlainObject(rule)) {
    return "Isn't a rule: each rule is an object with a subject and actions.";
  }

  const { subject, action, conditions, inverted, fields } = rule;
  const subjects = typeof subject === "string" ? [subject] : subject;
  if (!Array.isArray(subjects) || subjects.length !== 1 || typeof subjects[0] !== "string") {
    return "Names no subject, or more than one.";
  }

  const actions = typeof action === "string" ? [action] : action;
  if (!Array.isArray(actions) || !actions.every((item) => typeof item === "string")) {
    return `Has no list of actions on "${subjects[0]}".`;
  }

  if (inverted !== undefined && typeof inverted !== "boolean") {
    return `Sets "inverted" on "${subjects[0]}" to something other than true or false.`;
  }

  if (inverted === true && SUBJECTS_WITHOUT_DENY.has(subjects[0])) {
    return `Denies "${subjects[0]}", which Infisical can't save as a deny, so it would allow it instead. Remove the rule, or leave the action out of an allow.`;
  }

  if (fields !== undefined && fields !== null) {
    return `Limits "${subjects[0]}" to some fields, which Agent Vault doesn't use.`;
  }

  if (conditions !== undefined && conditions !== null && !isPlainObject(conditions)) {
    return `Has conditions on "${subjects[0]}" that aren't an object.`;
  }

  return {
    subject: subjects[0],
    actions: unique(actions as string[]),
    conditions:
      isPlainObject(conditions) && Object.keys(conditions).length ? conditions : undefined,
    isInverted: inverted === true
  };
};

// Whose sessions a rule covers: every session (no condition), the caller's own ($eq) or everyone else's ($ne). A
// string says why the editor can't show the condition.
const actorOperatorOf = (conditions?: Record<string, unknown>) => {
  if (!conditions) return null;
  const otherKey = Object.keys(conditions).find((key) => key !== "actorId");
  if (otherKey) return `Limits sessions by "${otherKey}". Only actorId is supported.`;
  const value = conditions.actorId;
  if (value === AGENT_VAULT_SESSION_SELF) return PermissionConditionOperators.$EQ;
  if (isPlainObject(value) && Object.keys(value).length === 1) {
    if (value[PermissionConditionOperators.$EQ] === AGENT_VAULT_SESSION_SELF) {
      return PermissionConditionOperators.$EQ;
    }
    if (value[PermissionConditionOperators.$NEQ] === AGENT_VAULT_SESSION_SELF) {
      return PermissionConditionOperators.$NEQ;
    }
  }
  return `Limits sessions by actorId with something other than $eq or $ne on ${AGENT_VAULT_SESSION_SELF}.`;
};

// Reads a session rule into the editor's keys, the inverse of toApiSessionRules, or says why it can't.
const sessionKeysOf = ({ actions, conditions }: TNormalizedRule): string[] | string => {
  const editorOnly = actions.filter((name) => EVERYONE_KEYS.includes(name));
  if (editorOnly.length) {
    return `Uses ${editorOnly.join(", ")} on "${Sub.AgentVaultSessions}", which isn't an action a role can hold there.`;
  }
  const operator = actorOperatorOf(conditions);
  if (operator === null) {
    return actions.flatMap((name) =>
      ACTOR_ACTIONS.includes(name) ? [name, EVERYONE_KEY_OF[name]] : [name]
    );
  }
  if (
    operator !== PermissionConditionOperators.$EQ &&
    operator !== PermissionConditionOperators.$NEQ
  ) {
    return operator;
  }
  const outside = actions.filter((name) => !ACTOR_ACTIONS.includes(name));
  if (outside.length) {
    return `Limits ${outside.join(", ")} on sessions by who started them, which only read, edit and revoke take.`;
  }
  return operator === PermissionConditionOperators.$EQ
    ? actions
    : actions.map((name) => EVERYONE_KEY_OF[name]);
};

const idsFromValue = (value: unknown): unknown[] | string => {
  if (typeof value === "string") return [value];
  if (!isPlainObject(value)) return "a value that is neither an ID nor an operator";

  const operators = Object.keys(value);
  if (operators.length !== 1) return "more than one operator";

  const [operator] = operators;
  if (operator === PermissionConditionOperators.$EQ) return [value[operator]];
  if (operator === PermissionConditionOperators.$IN) {
    const ids = value[operator];
    return Array.isArray(ids) ? ids : `${operator} without a list`;
  }
  return `the ${operator} operator`;
};

const parseIdCondition = (
  rowKey: TResourceRowKey,
  field: string,
  conditions: Record<string, unknown>
): string[] | string => {
  const { plural } = RESOURCE_NOUNS[rowKey];
  const otherKey = Object.keys(conditions).find((key) => key !== field);
  if (otherKey) return `Limits ${plural} by "${otherKey}". Only ${field} is supported.`;

  const ids = idsFromValue(conditions[field]);
  if (typeof ids === "string") return `Limits ${plural} with ${ids}.`;
  if (!ids.length) return `Limits ${plural} to an empty list.`;
  if (!ids.every((id) => typeof id === "string" && UUID_RE.test(id))) {
    return `Names ${plural} by something other than a lowercase ID.`;
  }
  return unique(ids as string[]);
};

/**
 * Reads rules into a policy, the inverse of policyToRules. Nothing is implied except that use carries read. A rule
 * outside what a role can hold in Agent Vault is returned in `unsupported` with the reason, and the policy holds the
 * rest, so a caller can keep such rules in JSON rather than drop them on save.
 */
export const rulesToPolicy = (rules: TProjectPermission[]): TParsedAgentVaultPolicy => {
  // Drawing a row for every id of a role this large would freeze the page.
  const idCount = countAgentVaultRuleIds(rules);
  if (idCount > AGENT_VAULT_MAX_ROLE_IDS) {
    return {
      policy: normalizeAgentVaultPolicy(createEmptyAgentVaultPolicy()),
      unsupported: [{ rule: rules[0], reason: tooManyRoleIdsMessage(idCount) }]
    };
  }
  const reasons = new Map<number, string>();
  const report = (index: number, reason: string) => {
    if (!reasons.has(index)) reasons.set(index, reason);
  };
  const policy = createEmptyAgentVaultPolicy();
  const hiddenAllows: { index: number; subject: ProjectPermissionSub; actions: string[] }[] = [];

  const addKey = (scope: TPermissionScope, effect: keyof TActionSets, key: string) => {
    if (scope.itemId && isResourceRowKey(scope.rowKey)) {
      const resource = policy[scope.rowKey];
      if (!resource.items.some((item) => item.id === scope.itemId)) {
        resource.items.push({ id: scope.itemId, ...emptySets() });
      }
    }
    getSets(policy, scope)[effect].push(key);
  };

  rules.forEach((rule, index) => {
    let normalized = normalizeRule(rule);
    if (typeof normalized === "string") {
      report(index, normalized);
      return;
    }
    if (normalized.subject === Sub.AgentVaultSessions) {
      const keys = sessionKeysOf(normalized);
      if (typeof keys === "string") {
        report(index, keys);
        return;
      }
      normalized = { ...normalized, actions: keys, conditions: undefined };
    }

    const subject = normalized.subject as ProjectPermissionSub;
    const subjectRules = SUBJECT_RULES[subject];
    if (!subjectRules) {
      report(index, `Applies to "${subject}", which a role in Agent Vault doesn't use.`);
      return;
    }

    const resourceKey = PERMISSION_ROWS.find(
      (row) => isResourceRowKey(row.key) && row.actions[0].subject === subject
    )?.key as TResourceRowKey | undefined;
    let ids: string[] | undefined;
    if (normalized.conditions) {
      if (!resourceKey || !subjectRules.idField) {
        report(
          index,
          `Limits "${subject}" with a condition, which only access bundles, services and skills take.`
        );
        return;
      }
      const parsed = parseIdCondition(resourceKey, subjectRules.idField, normalized.conditions);
      if (typeof parsed === "string") {
        report(index, parsed);
        return;
      }
      ids = parsed;
    }

    const effect = normalized.isInverted ? "deny" : "allow";
    const hiddenActions = normalized.actions.filter((name) => subjectRules.ignored?.includes(name));
    if (hiddenActions.length && !ids) {
      policy.hidden = [
        ...(policy.hidden ?? []),
        { subject, action: hiddenActions, ...(normalized.isInverted ? { inverted: true } : {}) }
      ];
      if (!normalized.isInverted) hiddenAllows.push({ index, subject, actions: hiddenActions });
    }
    normalized.actions.forEach((name) => {
      if (subjectRules.ignored?.includes(name)) return;
      const owner = ACTION_OWNERS.get(ownerId(subject, name));
      if (!owner) {
        report(index, `Uses ${name} on "${subject}", which isn't an action a role can hold there.`);
        return;
      }
      if (!ids) {
        addKey({ rowKey: owner.rowKey }, effect, owner.action.key);
        return;
      }
      if (owner.action.isAllOnly && resourceKey) {
        report(
          index,
          `Limits ${name} to specific ${RESOURCE_NOUNS[resourceKey].plural}, which isn't possible.`
        );
        return;
      }
      ids.forEach((itemId) => addKey({ rowKey: owner.rowKey, itemId }, effect, owner.action.key));
    });
  });

  // The editor would show the subject as granting nothing and drop these on save (withoutLoneHiddenAllows).
  hiddenAllows
    .filter(({ subject }) => !actionsOfSubject(policy, subject, "allow").length)
    .forEach(({ index, subject, actions }) =>
      report(
        index,
        `Allows ${actions.join(", ")} on "${subject}", which the visual editor hides and keeps only beside an action it shows there.`
      )
    );

  const unsupported = [...reasons]
    .sort(([a], [b]) => a - b)
    .map(([index, reason]) => ({ rule: rules[index], reason }));

  return { policy: normalizeAgentVaultPolicy(policy), unsupported };
};

/** Equal for any two rule lists that grant the same thing, however they are split or ordered. */
export const canonicalRulesKey = (rules: TProjectPermission[]) => {
  const { policy, unsupported } = rulesToPolicy(rules);
  if (unsupported.length) return `rules:${JSON.stringify(rules)}`;
  return `policy:${JSON.stringify(policyToRules(policy))}`;
};

export type TParseRulesJsonResult = { rules: TProjectPermission[] } | { error: string };

/** Only checks the shape the editor needs; the API validates everything else on save. */
export const parseRulesJson = (text: string): TParseRulesJsonResult => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid JSON." };
  }
  if (!Array.isArray(value)) return { error: "Rules must be a JSON array." };
  const badIndex = value.findIndex((rule) => !isPlainObject(rule));
  if (badIndex !== -1) return { error: `Rule ${badIndex + 1} must be an object.` };
  const idCount = countAgentVaultRuleIds(value as TProjectPermission[]);
  if (idCount > AGENT_VAULT_MAX_ROLE_IDS) return { error: tooManyRoleIdsMessage(idCount) };
  return { rules: value as TProjectPermission[] };
};

const RULE_KEY_ORDER = ["subject", "action", "conditions", "inverted"];

// The API returns each rule with its keys in its own order and `inverted: false` on every allow. Laying every rule
// out one way keeps a role's JSON the same before a save, after it and on the next load.
const layOutRule = (rule: unknown) => {
  if (!isPlainObject(rule)) return rule;
  const keys = [
    ...RULE_KEY_ORDER.filter((key) => key in rule),
    ...Object.keys(rule).filter((key) => !RULE_KEY_ORDER.includes(key))
  ];
  return Object.fromEntries(
    keys
      .filter((key) => !(key === "inverted" && rule[key] === false))
      .map((key) => [key, rule[key]])
  );
};

export const formatRulesJson = (rules: unknown) =>
  JSON.stringify(Array.isArray(rules) ? rules.map(layOutRule) : rules, null, 2);

const inheritedKeys = (
  policy: TAgentVaultPolicy,
  scope: TPermissionScope,
  effect: keyof TActionSets
) =>
  scope.itemId && isResourceRowKey(scope.rowKey)
    ? policy[scope.rowKey][effect].filter((key) =>
        itemKeysOf(scope.rowKey as TResourceRowKey).includes(key)
      )
    : [];

/** Everything a scope allows, which for one bundle, service or skill includes what every one of them is allowed. */
export const getEffectiveAllow = (policy: TAgentVaultPolicy, scope: TPermissionScope) =>
  orderKeys(
    scope.rowKey,
    unique([...inheritedKeys(policy, scope, "allow"), ...getSets(policy, scope).allow])
  );

export const getEffectiveDeny = (policy: TAgentVaultPolicy, scope: TPermissionScope) =>
  orderKeys(
    scope.rowKey,
    unique([...inheritedKeys(policy, scope, "deny"), ...getSets(policy, scope).deny])
  );

const levelByAllow = (rowKey: TPermissionRowKey, allow: string[]) =>
  getPermissionRow(rowKey).levels.find((level) => isSameSet(level.allow, allow))?.value ??
  CUSTOM_LEVEL;

/** The named level a row is at, or custom. For bundles, services and skills this is the level every one of them has. */
export const getRowLevel = (policy: TAgentVaultPolicy, rowKey: TPermissionRowKey) => {
  const sets = normalizeSets(rowKey, policy[rowKey]);
  if (sets.deny.length) return CUSTOM_LEVEL;
  const allOnly = getPermissionRow(rowKey)
    .actions.filter((action) => action.isAllOnly)
    .map(({ key }) => key);
  return levelByAllow(rowKey, without(sets.allow, allOnly));
};

export const getItemLevel = (
  policy: TAgentVaultPolicy,
  rowKey: TResourceRowKey,
  itemId: string
) => {
  const scope = { rowKey, itemId };
  const { deny } = getSets(policy, scope);
  const effectiveDeny = getEffectiveDeny(policy, scope);
  const effectiveAllow = getEffectiveAllow(policy, scope);
  if (isSubset(itemKeysOf(rowKey), effectiveDeny)) return DENIED_LEVEL;
  // A named level would claim an action that a deny for every one of them takes back.
  if (deny.length || effectiveAllow.some((key) => effectiveDeny.includes(key))) return CUSTOM_LEVEL;
  return levelByAllow(rowKey, effectiveAllow);
};

/** Whether a listed bundle, service or skill gets nothing the rest don't, so saving leaves it out. */
export const isItemRedundant = (
  policy: TAgentVaultPolicy,
  rowKey: TResourceRowKey,
  itemId: string
) => !normalizeResource(rowKey, policy[rowKey]).items.some((item) => item.id === itemId);

const allowKey = (policy: TAgentVaultPolicy, scope: TPermissionScope, key: string) =>
  withRelated(scope, key, "needs").reduce((next, owner) => {
    const target = relatedScope(scope, owner);
    const sets = getSets(next, target);
    return withSets(
      next,
      target,
      canonicalLegacy(target.rowKey, {
        allow: unique([...sets.allow, owner.action.key]),
        deny: without(sets.deny, [owner.action.key])
      })
    );
  }, policy);

const unallowKey = (policy: TAgentVaultPolicy, scope: TPermissionScope, key: string) =>
  withRelated(scope, key, "neededBy").reduce((next, owner) => {
    const target = relatedScope(scope, owner);
    const sets = getSets(next, target);
    return withSets(next, target, { ...sets, allow: without(sets.allow, [owner.action.key]) });
  }, policy);

const denyKey = (policy: TAgentVaultPolicy, scope: TPermissionScope, key: string) =>
  withRelated(scope, key, "neededBy").reduce((next, owner) => {
    const target = relatedScope(scope, owner);
    const sets = getSets(next, target);
    const canDeny = !SUBJECTS_WITHOUT_DENY.has(owner.action.subject);
    return withSets(
      next,
      target,
      canonicalLegacy(target.rowKey, {
        allow: without(sets.allow, [owner.action.key]),
        deny: canDeny ? unique([...sets.deny, owner.action.key]) : sets.deny
      })
    );
  }, policy);

/**
 * Ticks or unticks Allow for one action. Allowing an action also allows what it needs, such as View, and unticking one
 * unticks whatever needed it. Only edits do this: stored rules are shown as they are.
 */
export const setActionAllowed = (
  policy: TAgentVaultPolicy,
  scope: TPermissionScope,
  key: string,
  isAllowed: boolean
) => (isAllowed ? allowKey(policy, scope, key) : unallowKey(policy, scope, key));

/** Ticks or unticks Deny for one action. Denying an action also denies whatever needs it, and stops allowing both. */
export const setActionDenied = (
  policy: TAgentVaultPolicy,
  scope: TPermissionScope,
  key: string,
  isDenied: boolean
) => {
  if (isDenied) {
    const action = actionOf(scope.rowKey, key);
    if (action && SUBJECTS_WITHOUT_DENY.has(action.subject)) return policy;
    return denyKey(policy, scope, key);
  }
  const sets = getSets(policy, scope);
  return withSets(policy, scope, { ...sets, deny: without(sets.deny, [key]) });
};

/**
 * Leaves an action neither allowed nor denied. A saved role can hold both on one action, so the deny goes and then the
 * allow, rather than only the one the editor shows.
 */
export const setActionCleared = (
  policy: TAgentVaultPolicy,
  scope: TPermissionScope,
  key: string
) => {
  const withoutDeny = setActionDenied(policy, scope, key, false);
  return getSets(withoutDeny, scope).allow.includes(key)
    ? setActionAllowed(withoutDeny, scope, key, false)
    : withoutDeny;
};

export type TActionState = {
  isAllowed: boolean;
  isDenied: boolean;
  // Set when the box can't be changed in this scope, with the reason to show.
  allowLock?: string;
  denyLock?: string;
};

const labelsOf = (owners: TActionOwner[]) => owners.map(({ action }) => action.label).join(", ");

const legacyLocks = (sets: TActionSets, action?: TPermissionAction) => {
  const legacy = action && SUBJECT_RULES[action.subject]?.legacy;
  if (!action || !legacy || legacy.action !== action.action) return {};
  const replacements = legacy.replacedBy.flatMap(
    (name) => ACTION_OWNERS.get(ownerId(action.subject, name)) ?? []
  );
  return {
    allowLock: replacements.some((owner) => sets.allow.includes(owner.action.key))
      ? `Replaced by ${labelsOf(replacements)}`
      : undefined,
    denyLock: replacements.some((owner) => sets.deny.includes(owner.action.key))
      ? `Already denied through ${labelsOf(replacements)}`
      : undefined
  };
};

/**
 * Whether the editor lists an action for a scope. A legacy action does what its replacements do, so it is listed only
 * while the scope already holds it, where it can still be cleared.
 */
export const isActionListed = (
  policy: TAgentVaultPolicy,
  scope: TPermissionScope,
  action: TPermissionAction
) => {
  if (scope.itemId && action.isAllOnly) return false;
  if (SUBJECT_RULES[action.subject]?.legacy?.action !== action.action) return true;
  const sets = getSets(policy, scope);
  return sets.allow.includes(action.key) || sets.deny.includes(action.key);
};

/** What the Allow and Deny boxes of one action show, and why one of them can't be changed. */
export const getActionState = (
  policy: TAgentVaultPolicy,
  scope: TPermissionScope,
  key: string
): TActionState => {
  const sets = getSets(policy, scope);
  const isAllowInherited = inheritedKeys(policy, scope, "allow").includes(key);
  const isDenyInherited = inheritedKeys(policy, scope, "deny").includes(key);
  const plural = isResourceRowKey(scope.rowKey) ? RESOURCE_NOUNS[scope.rowKey].plural : "";
  const legacy = legacyLocks(sets, actionOf(scope.rowKey, key));

  let { allowLock } = legacy;
  if (isAllowInherited) {
    allowLock = `Allowed for all ${plural}`;
  } else if (!allowLock && sets.allow.includes(key)) {
    const neededBy = withRelated(scope, key, "neededBy")
      .slice(1)
      .filter((owner) =>
        getEffectiveAllow(policy, relatedScope(scope, owner)).includes(owner.action.key)
      );
    if (neededBy.length) allowLock = `Needed by ${labelsOf(neededBy)}`;
  }

  return {
    isAllowed: isAllowInherited || sets.allow.includes(key),
    isDenied: isDenyInherited || sets.deny.includes(key),
    allowLock,
    denyLock: (() => {
      if (isDenyInherited) return `Denied for all ${plural}`;
      const subject = actionOf(scope.rowKey, key)?.subject;
      if (subject && SUBJECTS_WITHOUT_DENY.has(subject)) {
        return "This permission can't be denied. Leave Allow unticked instead.";
      }
      return legacy.denyLock;
    })()
  };
};

/**
 * Sets a row to a named level: exactly that level's actions, and no denies. Other rows on the same subject follow, so
 * turning sessions off also turns inline services off, and turning inline services on allows starting sessions.
 */
export const setRowLevel = (
  policy: TAgentVaultPolicy,
  rowKey: TPermissionRowKey,
  levelValue: string
) => {
  const row = getPermissionRow(rowKey);
  const level = row.levels.find(({ value }) => value === levelValue);
  if (!level) return policy;

  const scope = { rowKey };
  const kept = row.actions.filter((action) => action.isAllOnly).map(({ key }) => key);
  const removed = without(policy[rowKey].allow, [...level.allow, ...kept]);
  const cleared = removed.reduce((next, key) => unallowKey(next, scope, key), policy);
  const allowed = level.allow.reduce((next, key) => allowKey(next, scope, key), cleared);
  return withSets(allowed, scope, { allow: getSets(allowed, scope).allow, deny: [] });
};

/** Whether a row allows or denies anything, for every one of them or for one picked out. */
export const isRowEmpty = (policy: TAgentVaultPolicy, rowKey: TPermissionRowKey) => {
  const sets = policy[rowKey];
  if (sets.allow.length || sets.deny.length) return false;
  return !isResourceRowKey(rowKey) || !policy[rowKey].items.length;
};

/**
 * Takes everything off a row: its level, its denies, creating new ones, and any bundles, services or skills picked out.
 * Rows on the same subject follow, as they do when the row's level is set to none.
 */
export const clearPermissionRow = (policy: TAgentVaultPolicy, rowKey: TPermissionRowKey) => {
  const scope = { rowKey };
  const leveled = setRowLevel(policy, rowKey, NONE_LEVEL);
  const cleared = getPermissionRow(rowKey)
    .actions.filter((action) => action.isAllOnly)
    .reduce((next, { key }) => unallowKey(next, scope, key), leveled);
  const withoutDenies = withSets(cleared, scope, {
    allow: getSets(cleared, scope).allow,
    deny: []
  });
  if (!isResourceRowKey(rowKey)) return withoutDenies;
  return { ...withoutDenies, [rowKey]: { ...withoutDenies[rowKey], items: [] } };
};

/** Sets one bundle, service or skill to a named level, or denies it outright. */
export const setItemLevel = (
  policy: TAgentVaultPolicy,
  rowKey: TResourceRowKey,
  itemId: string,
  levelValue: string
) => {
  if (levelValue === DENIED_LEVEL) {
    return withSets(policy, { rowKey, itemId }, { allow: [], deny: itemKeysOf(rowKey) });
  }
  const level = getPermissionRow(rowKey).levels.find(({ value }) => value === levelValue);
  if (!level) return policy;
  return withSets(policy, { rowKey, itemId }, { allow: level.allow, deny: [] });
};

/**
 * The level a newly picked bundle, service or skill starts at: the first that adds to what every one of them has, and
 * that holds nothing denied for every one of them.
 */
export const getDefaultItemLevel = (policy: TAgentVaultPolicy, rowKey: TResourceRowKey) => {
  const inherited = policy[rowKey].allow.filter((key) => itemKeysOf(rowKey).includes(key));
  const deniedForAll = policy[rowKey].deny;
  const levels = getPermissionRow(rowKey).levels.filter(
    ({ value, allow }) => value !== NONE_LEVEL && !allow.some((key) => deniedForAll.includes(key))
  );
  const preferred = [
    ...levels.filter(({ allow }) => allow.includes(ResourceAction.Use)),
    ...levels
  ];
  return preferred.find(({ allow }) => !isSubset(allow, inherited))?.value ?? DENIED_LEVEL;
};

export const addResourceItems = (
  policy: TAgentVaultPolicy,
  rowKey: TResourceRowKey,
  itemIds: string[]
) => {
  const resource = policy[rowKey];
  const added = unique(itemIds).filter((id) => !resource.items.some((item) => item.id === id));
  const withItems = {
    ...policy,
    [rowKey]: {
      ...resource,
      items: [...resource.items, ...added.map((id) => ({ id, ...emptySets() }))]
    }
  } as TAgentVaultPolicy;
  const level = getDefaultItemLevel(policy, rowKey);
  return added.reduce((next, id) => setItemLevel(next, rowKey, id, level), withItems);
};

export const removeResourceItem = (
  policy: TAgentVaultPolicy,
  rowKey: TResourceRowKey,
  itemId: string
) =>
  ({
    ...policy,
    [rowKey]: {
      ...policy[rowKey],
      items: policy[rowKey].items.filter((item) => item.id !== itemId)
    }
  }) as TAgentVaultPolicy;

const scopesOf = (policy: TAgentVaultPolicy, rowKey: TPermissionRowKey): TPermissionScope[] =>
  isResourceRowKey(rowKey)
    ? [{ rowKey }, ...policy[rowKey].items.map((item) => ({ rowKey, itemId: item.id }))]
    : [{ rowKey }];

const canDo = (policy: TAgentVaultPolicy, scope: TPermissionScope, key: string) =>
  getEffectiveAllow(policy, scope).includes(key) && !getEffectiveDeny(policy, scope).includes(key);

export type TRowWarning = { itemId?: string; message: string };

/** A role is exactly its own rules; a person's own policy adds to whatever their roles allow. */
export type TPolicyKind = "role" | "policy";

const SESSIONS_NEVER_WORK =
  "Sessions can be started, but a session only works while its owner can view their own. Allow View Own";

const joinWords = (words: string[]) => {
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
};

const scopeWarnings = (
  policy: TAgentVaultPolicy,
  scope: TPermissionScope,
  kind: TPolicyKind
): TRowWarning[] => {
  const missing = new Map<string, { owner: TActionOwner; neededBy: TPermissionAction[] }>();
  getPermissionRow(scope.rowKey).actions.forEach((action) => {
    if (!canDo(policy, scope, action.key)) return;
    directPrerequisites(action.subject, action.action)
      .flatMap((name) => ACTION_OWNERS.get(ownerId(action.subject, name)) ?? [])
      .filter((owner) => !canDo(policy, relatedScope(scope, owner), owner.action.key))
      .forEach((owner) => {
        const id = ownerId(owner.rowKey, owner.action.key);
        const entry = missing.get(id) ?? { owner, neededBy: [] };
        entry.neededBy.push(action);
        missing.set(id, entry);
      });
  });

  return [...missing.values()].map(({ owner, neededBy }) => {
    const isSessionsNeverWork =
      owner.action.subject === Sub.AgentVaultSessions &&
      owner.action.action === SessionAction.Read &&
      neededBy.some(({ action }) => action === SessionAction.Create);
    const needed =
      owner.rowKey === scope.rowKey
        ? owner.action.label
        : `${owner.action.label} in ${getPermissionRow(owner.rowKey).label}`;
    // The holder's roles can supply what a policy leaves out, but nothing the policy denies.
    const canComeFromRole =
      kind === "policy" &&
      !getEffectiveDeny(policy, relatedScope(scope, owner)).includes(owner.action.key);
    if (isSessionsNeverWork) {
      return {
        itemId: scope.itemId,
        message: `${SESSIONS_NEVER_WORK}${canComeFromRole ? " unless their roles already do." : "."}`
      };
    }
    const needs = `${joinWords(neededBy.map(({ label }) => label))} ${neededBy.length > 1 ? "need" : "needs"} ${needed}`;
    return {
      itemId: scope.itemId,
      message: `${needs}${canComeFromRole ? ", unless their roles already allow it." : "."}`
    };
  });
};

/**
 * Stored rules can allow an action without what it needs. They are shown as stored, with these warnings saying what
 * is missing.
 */
export const getRowWarnings = (
  policy: TAgentVaultPolicy,
  rowKey: TPermissionRowKey,
  kind: TPolicyKind = "role"
) => scopesOf(policy, rowKey).flatMap((scope) => scopeWarnings(policy, scope, kind));

/** The risk to show when a row allows something that reaches past its holder, or nothing when it doesn't. */
export const getRowRisk = (policy: TAgentVaultPolicy, rowKey: TPermissionRowKey) => {
  const { risk } = getPermissionRow(rowKey);
  return risk && policy[rowKey].allow.some((key) => risk.actions.includes(key))
    ? risk.message
    : undefined;
};

export type TNameOf = (rowKey: TResourceRowKey, itemId: string) => string;

const NAMES_SHOWN = 3;

const listNames = (names: string[]) =>
  names.length > NAMES_SHOWN + 1
    ? `${names.slice(0, NAMES_SHOWN).join(", ")} and ${names.length - NAMES_SHOWN} more`
    : names.join(", ");

// One phrase per action group, such as "Users: View, Assign Roles", or just the labels for a row without groups.
const describeKeys = (rowKey: TPermissionRowKey, keys: string[]) => {
  const actions = getPermissionRow(rowKey).actions.filter(({ key }) => keys.includes(key));
  return unique(actions.map(({ group }) => group ?? "")).map((group) => {
    const labels = actions
      .filter((action) => (action.group ?? "") === group)
      .map(({ label }) => label)
      .join(", ");
    return group ? `${group}: ${labels}` : labels;
  });
};

const ITEM_LEVEL_ORDER = ["view", "use", "edit", "manage", CUSTOM_LEVEL, DENIED_LEVEL];

const levelOf = (rowKey: TPermissionRowKey, levelValue: string) =>
  getPermissionRow(rowKey).levels.find(({ value }) => value === levelValue);

export const getLevelLabel = (rowKey: TPermissionRowKey, levelValue: string) => {
  if (levelValue === DENIED_LEVEL) return "Denied";
  return levelOf(rowKey, levelValue)?.label ?? "Custom";
};

/** Whether a level allows an action that reaches past its holder, for marking it Privileged where it is offered. */
export const isLevelPrivileged = (rowKey: TPermissionRowKey, levelValue: string) => {
  const { risk } = getPermissionRow(rowKey);
  const level = levelOf(rowKey, levelValue);
  return Boolean(risk && level?.allow.some((key) => risk.actions.includes(key)));
};

const allOnlyKeys = (rowKey: TPermissionRowKey) =>
  getPermissionRow(rowKey)
    .actions.filter((action) => action.isAllOnly)
    .map(({ key }) => key);

const resourceDetails = (policy: TAgentVaultPolicy, rowKey: TResourceRowKey, nameOf: TNameOf) => {
  const { plural } = RESOURCE_NOUNS[rowKey];
  const resource = normalizeResource(rowKey, policy[rowKey]);
  const level = getRowLevel(policy, rowKey);
  const details: string[] = [];

  if (level === CUSTOM_LEVEL) {
    const allow = without(resource.allow, allOnlyKeys(rowKey));
    const deny = without(resource.deny, allOnlyKeys(rowKey));
    if (allow.length) details.push(`All ${plural}: ${describeKeys(rowKey, allow).join("; ")}`);
    if (deny.length) {
      details.push(`Denied for all ${plural}: ${describeKeys(rowKey, deny).join("; ")}`);
    }
  } else if (level !== NONE_LEVEL) {
    details.push(`All ${plural}: ${getLevelLabel(rowKey, level)}`);
  }

  ITEM_LEVEL_ORDER.forEach((itemLevel) => {
    const names = resource.items
      .filter((item) => getItemLevel(policy, rowKey, item.id) === itemLevel)
      .map((item) => nameOf(rowKey, item.id))
      .sort((a, b) => a.localeCompare(b));
    if (names.length) details.push(`${getLevelLabel(rowKey, itemLevel)}: ${listNames(names)}`);
  });

  if (resource.deny.includes(ResourceAction.Create)) details.push(`Can't create ${plural}`);
  else if (resource.allow.includes(ResourceAction.Create)) details.push(`Can create ${plural}`);
  return details;
};

export type TAccessBadge = "full" | "limited" | "denied" | "none";

export type TRowSummary = { access: TAccessBadge; details: string[] };

const accessOf = (hasAllow: boolean, hasDeny: boolean, isTop: boolean): TAccessBadge => {
  if (!hasAllow) return hasDeny ? "denied" : "none";
  return isTop && !hasDeny ? "full" : "limited";
};

/** How much a row grants, and one line per thing it grants or denies, for the summary beside the editor. */
export const getRowSummary = (
  policy: TAgentVaultPolicy,
  rowKey: TPermissionRowKey,
  nameOf: TNameOf
): TRowSummary => {
  if (isResourceRowKey(rowKey)) {
    const resource = normalizeResource(rowKey, policy[rowKey]);
    const hasAllow =
      resource.allow.length > 0 || resource.items.some((item) => item.allow.length > 0);
    const hasDeny = resource.deny.length > 0 || resource.items.some((item) => item.deny.length > 0);
    const isTop =
      getRowLevel(policy, rowKey) === "manage" && resource.allow.includes(ResourceAction.Create);
    return {
      access: accessOf(hasAllow, hasDeny, isTop),
      details: resourceDetails(policy, rowKey, nameOf)
    };
  }

  const sets = normalizeSets(rowKey, policy[rowKey]);
  const level = getRowLevel(policy, rowKey);
  const top = getPermissionRow(rowKey).levels[getPermissionRow(rowKey).levels.length - 1];
  let details: string[] = [];
  if (level === CUSTOM_LEVEL) {
    details = [
      ...describeKeys(rowKey, sets.allow),
      ...(sets.deny.length ? [`Denied: ${describeKeys(rowKey, sets.deny).join("; ")}`] : [])
    ];
  } else if (level !== NONE_LEVEL) {
    details = [getLevelLabel(rowKey, level)];
  }
  return {
    access: accessOf(sets.allow.length > 0, sets.deny.length > 0, level === top.value),
    details
  };
};

/**
 * Set for a role that lets its holders use bundles, services or skills but not start a session to use them in. A
 * person's own policy gets none, since their roles may let them start sessions.
 */
export const getPolicyWarning = (policy: TAgentVaultPolicy, kind: TPolicyKind) => {
  if (kind !== "role") return undefined;
  const usesSomething = (["accessBundles", "services", "skills"] as const).some((rowKey) =>
    scopesOf(policy, rowKey).some((scope) => canDo(policy, scope, ResourceAction.Use))
  );
  // Starting sessions without viewing their own is the Sessions row's warning to give.
  const canStartSessions = canDo(policy, { rowKey: "sessions" }, SessionAction.Create);
  return usesSomething && !canStartSessions
    ? "Holders can use access bundles, services or skills, but this role doesn't let them start sessions. Set Sessions to Own Sessions, or give them another role that does."
    : undefined;
};

export type TAgentVaultRoleTemplate = {
  id: string;
  name: string;
  description: string;
  policy: TAgentVaultPolicy;
};

const withLevels = (levels: Partial<Record<TPermissionRowKey, string>>) =>
  (Object.entries(levels) as [TPermissionRowKey, string][]).reduce(
    (policy, [rowKey, level]) => setRowLevel(policy, rowKey, level),
    createEmptyAgentVaultPolicy()
  );

// What a role that starts sessions needs: its own sessions, with skills sent along, and viewing proxies and hooks.
const SESSION_USER_LEVELS: Partial<Record<TPermissionRowKey, string>> = {
  sessions: "own",
  inlineSkills: "yes",
  proxies: "view",
  hooks: "view"
};

const BASICS = "Their own sessions, and viewing proxies and hooks";

export const AGENT_VAULT_ROLE_TEMPLATES: TAgentVaultRoleTemplate[] = [
  {
    id: "service-user",
    name: "Service User",
    description: `${BASICS}. Pick the access bundles, services and skills they use on the next page.`,
    policy: withLevels(SESSION_USER_LEVELS)
  },
  {
    id: "builder",
    name: "Builder",
    description: `${BASICS}, plus creating access bundles and services, and using and editing every one of them.`,
    policy: (["accessBundles", "services"] as const).reduce(
      (policy, rowKey) => setActionAllowed(policy, { rowKey }, ResourceAction.Create, true),
      withLevels({ ...SESSION_USER_LEVELS, accessBundles: "edit", services: "edit" })
    )
  },
  {
    id: "auditor",
    name: "Auditor",
    description: `${BASICS}, plus seeing everyone's sessions, members, audit logs and session log settings.`,
    policy: withLevels({
      ...SESSION_USER_LEVELS,
      sessions: "see-all",
      members: "view",
      sessionLogSettings: "view",
      auditLogs: "view"
    })
  },
  {
    id: "proxy-operator",
    name: "Proxy Operator",
    description: `${BASICS}, plus creating, editing and deleting proxies, and issuing and revoking their tokens.`,
    policy: withLevels({ ...SESSION_USER_LEVELS, proxies: "manage" })
  }
];

/** Every action the editor shows, allowed everywhere: what the built-in Admin role can do. */
// The actions the built-in admin role holds that the editor hides, so a copy of admin keeps them.
const ADMIN_HIDDEN_RULES: NonNullable<TAgentVaultPolicy["hidden"]> = [
  {
    subject: ProjectPermissionSub.Member,
    action: [ProjectPermissionMemberActions.AssignAdditionalPrivileges]
  },
  {
    subject: ProjectPermissionSub.Identity,
    action: [ProjectPermissionMemberActions.AssignAdditionalPrivileges]
  },
  {
    subject: ProjectPermissionSub.Settings,
    action: [ProjectPermissionActions.Create, ProjectPermissionActions.Delete]
  }
];

export const createFullAgentVaultPolicy = (): TAgentVaultPolicy => ({
  ...PERMISSION_ROWS.reduce((policy, row) => {
    const top = row.levels[row.levels.length - 1];
    const withTop = setRowLevel(policy, row.key, top.value);
    return row.actions
      .filter((action) => action.isAllOnly)
      .reduce(
        (next, action) => setActionAllowed(next, { rowKey: row.key }, action.key, true),
        withTop
      );
  }, createEmptyAgentVaultPolicy()),
  hidden: ADMIN_HIDDEN_RULES
});

/**
 * What a built-in role grants in Agent Vault, or undefined for a custom one. The roles API answers a built-in role
 * with the rules it has in other project types, so the editor shows and copies these instead.
 */
export const getBuiltInAgentVaultPolicy = (roleSlug: string): TAgentVaultPolicy | undefined => {
  if (roleSlug === ProjectMembershipRole.Admin) return createFullAgentVaultPolicy();
  if (roleSlug === ProjectMembershipRole.NoAccess) return createEmptyAgentVaultPolicy();
  return undefined;
};
