import { createMongoAbility, subject as caslSubject } from "@casl/ability";
import { describe, expect, it } from "vitest";

import { rulesForCopy } from "@app/components/agent-vault/roles/roleSchema";
import { conditionsMatcher } from "@app/hooks/api/roles/permission-matcher";
import { TProjectPermission } from "@app/hooks/api/roles/types";

import { SUBJECTS_WITHOUT_DENY } from "./agentVaultPermissionCatalog";
import {
  addResourceItems,
  AGENT_VAULT_ROLE_TEMPLATES,
  canonicalRulesKey,
  createEmptyAgentVaultPolicy,
  createFullAgentVaultPolicy,
  CUSTOM_LEVEL,
  DENIED_LEVEL,
  formatRulesJson,
  getActionState,
  getBuiltInAgentVaultPolicy,
  AGENT_VAULT_MAX_IDS_PER_CONDITION,
  AGENT_VAULT_MAX_ROLE_IDS,
  countAgentVaultRuleIds,
  getDefaultItemLevel,
  getItemLevel,
  getPolicyWarning,
  getRowLevel,
  isActionListed,
  getRowRisk,
  getRowSummary,
  getRowWarnings,
  isItemRedundant,
  NONE_LEVEL,
  normalizeAgentVaultPolicy,
  parseRulesJson,
  PERMISSION_ROWS,
  policyToRules,
  rulesToPolicy,
  setActionAllowed,
  setActionDenied,
  setItemLevel,
  setRowLevel,
  TActionSets,
  TAgentVaultPolicy,
  TCapabilityRowKey,
  TPermissionRowKey,
  TResourceRowKey
} from "./agentVaultPolicyModel";

const GITHUB = "e83db5d4-ca14-4e6b-bcbe-d38e61f7c796";
const LINEAR = "9686cd1a-659d-48ad-b53c-ec27a39b0830";
const STRIPE = "8facda6c-9da5-41c6-a92f-21329dcd09ca";
const SKILL = "1f5a3bd4-04b0-4759-9bf9-006e9649c66d";
const OTHER_SKILL = "5b8f2c7a-3d4e-4f1a-9b6c-2e7d8a9f0c13";
const BUNDLE = "4c3b6f0e-8f5c-4a0b-9a51-0d2b1c7e5f21";

const SERVICES = "agent-vault-services";
const SKILLS = "agent-vault-skills";
const SESSIONS = "agent-vault-sessions";
const BUNDLES = "agent-vault-access-bundles";
const PROXIES = "agent-vault-proxies";
const VARIABLES = "agent-vault-variables";
const HOOKS = "agent-vault-hooks";

// Mirrors buildAgentVaultProjectAdminPermissionRules in backend/src/ee/services/permission/default-roles.ts.
const ADMIN_RULES: TProjectPermission[] = [
  { subject: BUNDLES, action: ["read", "use", "create", "edit", "delete"] },
  {
    subject: SESSIONS,
    action: [
      "read",
      "create",
      "edit",
      "revoke",
      "create-with-inline-services",
      "create-with-inline-skills",
      "manage-delegations"
    ]
  },
  { subject: PROXIES, action: ["read", "create", "edit", "delete", "issue-token", "revoke"] },
  { subject: SKILLS, action: ["read", "use", "create", "edit", "delete"] },
  { subject: SERVICES, action: ["read", "use", "create", "edit", "delete"] },
  { subject: VARIABLES, action: ["read", "create", "edit", "delete", "read-value"] },
  { subject: HOOKS, action: ["read", "create", "edit", "delete"] },
  {
    subject: "app-connections",
    action: [
      "read-app-connections",
      "create-app-connections",
      "edit-app-connections",
      "delete-app-connections",
      "connect-app-connections"
    ]
  },
  {
    subject: "member",
    action: [
      "create",
      "edit",
      "delete",
      "read",
      "grant-privileges",
      "assign-role",
      "assign-additional-privileges"
    ]
  },
  {
    subject: "groups",
    action: ["create", "edit", "delete", "read", "grant-privileges", "assign-role"]
  },
  {
    subject: "identity",
    action: [
      "create",
      "edit",
      "delete",
      "read",
      "grant-privileges",
      "assign-role",
      "assign-additional-privileges",
      "get-token",
      "create-token",
      "delete-token",
      "revoke-auth",
      "edit-auth"
    ]
  },
  { subject: "role", action: ["read", "edit", "create", "delete"] },
  { subject: "settings", action: ["read", "edit", "create", "delete"] },
  { subject: "workspace", action: ["edit", "delete"] },
  { subject: "audit-logs", action: ["read", "edit"] }
];

const SELF = "{{identity.id}}";
const OWN_SESSIONS = { actorId: { $eq: SELF } };
const OTHERS_SESSIONS = { actorId: { $ne: SELF } };

// The Member role the role migrations make: own sessions, with skills sent along, and viewing proxies and hooks.
const MEMBER_RULES: TProjectPermission[] = [
  { subject: SESSIONS, action: ["create", "create-with-inline-skills"] },
  { subject: SESSIONS, action: ["read", "edit", "revoke"], conditions: OWN_SESSIONS },
  { subject: PROXIES, action: ["read"] },
  { subject: HOOKS, action: ["read"] }
];

// Agent Vault checks neither: session log settings are only read and changed, and it gives access through roles alone.
const IGNORED_ACTIONS = [
  "settings|create",
  "settings|delete",
  "member|assign-additional-privileges",
  "identity|assign-additional-privileges"
];

const NAMES: Record<string, string> = {
  [BUNDLE]: "release",
  [GITHUB]: "github",
  [LINEAR]: "linear",
  [STRIPE]: "stripe",
  [SKILL]: "triage"
};
const nameOf = (_rowKey: TResourceRowKey, id: string) => NAMES[id] ?? id;

const empty = createEmptyAgentVaultPolicy;

const withRow = (
  rowKey: TPermissionRowKey,
  sets: Partial<TActionSets> & { items?: (TActionSets & { id: string })[] },
  base: TAgentVaultPolicy = empty()
) => ({ ...base, [rowKey]: { ...base[rowKey], ...sets } }) as TAgentVaultPolicy;

const expectRoundTrip = (policy: TAgentVaultPolicy) => {
  const rules = policyToRules(policy);
  const parsed = rulesToPolicy(rules);
  expect(parsed.unsupported).toEqual([]);
  expect(parsed.policy).toEqual(normalizeAgentVaultPolicy(policy));
  expect(policyToRules(parsed.policy)).toEqual(rules);
};

const reasonsOf = (rules: TProjectPermission[]) =>
  rulesToPolicy(rules).unsupported.map(({ reason }) => reason);

// What the API decides from a role's rules: it puts denies after allows, and CASL keeps the last rule that matches.
const canDoWith = (
  rules: TProjectPermission[],
  action: string,
  subjectType: string,
  fields: Record<string, string>
) =>
  createMongoAbility(
    [...rules].sort((a, b) => Number(Boolean(a.inverted)) - Number(Boolean(b.inverted))) as never,
    { conditionsMatcher }
  ).can(action, caslSubject(subjectType, fields) as never);

const everySplit = (keys: string[]): TActionSets[] =>
  keys.reduce<TActionSets[]>(
    (acc, key) =>
      acc.flatMap(({ allow, deny }) => [
        { allow, deny },
        { allow: [...allow, key], deny },
        { allow, deny: [...deny, key] }
      ]),
    [{ allow: [], deny: [] }]
  );

const seededPicker = (seed: number) => {
  let state = seed;
  return (count: number) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % count;
  };
};

describe("the catalog", () => {
  const admin = new Set(
    ADMIN_RULES.flatMap(({ subject, action }) =>
      (action as string[]).map((name) => `${subject}|${name}`)
    )
  );
  const shown = new Set(
    PERMISSION_ROWS.flatMap((row) =>
      row.actions.map((action) => `${action.subject}|${action.action}`)
    )
  );
  // The editor lists everyone's sessions as actions of its own, which a role holds as the plain session actions.
  const EVERYONE_KEYS: Record<string, string> = {
    "read-any": "read",
    "edit-any": "edit",
    "revoke-any": "revoke"
  };
  const shownAsApi = new Set(
    PERMISSION_ROWS.flatMap((row) =>
      row.actions.map(
        (action) =>
          `${action.subject}|${action.subject === SESSIONS ? (EVERYONE_KEYS[action.action] ?? action.action) : action.action}`
      )
    )
  );

  it("shows every action the admin role holds, apart from the ones nothing checks", () => {
    expect([...admin].filter((id) => !shownAsApi.has(id)).sort()).toEqual(
      [...IGNORED_ACTIONS].sort()
    );
  });

  it("shows nothing the admin role doesn't hold", () => {
    expect([...shownAsApi].filter((id) => !admin.has(id))).toEqual([]);
  });

  it("names each action once", () => {
    expect(shown.size).toBe(PERMISSION_ROWS.flatMap((row) => row.actions).length);
    PERMISSION_ROWS.forEach((row) => {
      const keys = row.actions.map(({ key }) => key);
      expect(new Set(keys).size).toBe(keys.length);
      row.levels.forEach((level) =>
        expect(level.allow.every((key) => keys.includes(key))).toBe(true)
      );
    });
  });
});

describe("session rules", () => {
  const ME = "3c90c3cc-0d44-4b50-8888-8dd25736052a";
  const SOMEONE = "7b1e4f2a-9c3d-4a6b-8e5f-1d2c3b4a5e6f";
  // The API fills in {{identity.id}} with the caller's id before it checks anything.
  const asCaller = (rules: TProjectPermission[]) =>
    JSON.parse(JSON.stringify(rules).replaceAll(SELF, ME)) as TProjectPermission[];
  const reachOf = (sets: TActionSets) => {
    const rules = asCaller(policyToRules(withRow("sessions", sets)));
    return {
      own: canDoWith(rules, "read", SESSIONS, { actorId: ME }),
      others: canDoWith(rules, "read", SESSIONS, { actorId: SOMEONE })
    };
  };

  it.each([
    [
      { allow: ["read"], deny: [] },
      { own: true, others: false }
    ],
    [
      { allow: ["read", "read-any"], deny: [] },
      { own: true, others: true }
    ],
    [
      { allow: ["read-any"], deny: [] },
      { own: false, others: true }
    ],
    [
      { allow: ["read", "read-any"], deny: ["read-any"] },
      { own: true, others: false }
    ],
    [
      { allow: ["read", "read-any"], deny: ["read"] },
      { own: false, others: true }
    ],
    [
      { allow: ["read", "read-any"], deny: ["read", "read-any"] },
      { own: false, others: false }
    ]
  ])("lets %j view the sessions the API says (%j)", (sets, expected) => {
    expect(reachOf(sets)).toEqual(expected);
  });
});

describe("policyToRules", () => {
  it("writes nothing for a policy that grants nothing", () => {
    expect(policyToRules(empty())).toEqual([]);
  });

  it("writes one allow and one deny per subject, and merges rows that share one", () => {
    const policy = {
      ...empty(),
      sessions: { allow: ["read", "create"], deny: ["revoke-any"] },
      inlineServices: { allow: ["create-with-inline-services"], deny: [] },
      proxies: { allow: ["read"], deny: ["delete"] }
    };

    expect(policyToRules(policy)).toEqual([
      { subject: SESSIONS, action: ["create", "create-with-inline-services"] },
      { subject: SESSIONS, action: ["read"], conditions: OWN_SESSIONS },
      { subject: SESSIONS, action: ["revoke"], inverted: true, conditions: OTHERS_SESSIONS },
      { subject: PROXIES, action: ["read"] },
      { subject: PROXIES, action: ["delete"], inverted: true }
    ]);
  });

  it("writes one rule per distinct set of extra and denied actions, with sorted ids", () => {
    const rules = policyToRules(
      withRow("services", {
        allow: ["read", "create"],
        deny: [],
        items: [
          { id: STRIPE, allow: [], deny: ["read", "use", "edit", "delete"] },
          { id: LINEAR, allow: ["read", "use"], deny: [] },
          { id: GITHUB, allow: ["use"], deny: [] },
          { id: SKILL, allow: ["read", "use", "edit"], deny: ["delete"] }
        ]
      })
    );

    expect(rules).toEqual([
      { subject: SERVICES, action: ["read", "create"] },
      {
        subject: SERVICES,
        action: ["read", "use"],
        conditions: { serviceId: { $in: [LINEAR, GITHUB].sort() } }
      },
      {
        subject: SERVICES,
        action: ["read", "use", "edit"],
        conditions: { serviceId: { $in: [SKILL] } }
      },
      {
        subject: SERVICES,
        action: ["read", "use", "edit", "delete"],
        inverted: true,
        conditions: { serviceId: { $in: [STRIPE] } }
      },
      {
        subject: SERVICES,
        action: ["delete"],
        inverted: true,
        conditions: { serviceId: { $in: [SKILL] } }
      }
    ]);
  });

  it("writes only what a service adds to what every service has", () => {
    expect(
      policyToRules(
        withRow("services", {
          allow: ["read", "use"],
          deny: [],
          items: [
            { id: GITHUB, allow: ["read", "use", "edit"], deny: [] },
            { id: LINEAR, allow: ["read"], deny: [] }
          ]
        })
      )
    ).toEqual([
      { subject: SERVICES, action: ["read", "use"] },
      { subject: SERVICES, action: ["edit"], conditions: { serviceId: { $in: [GITHUB] } } }
    ]);
  });

  it("writes read wherever use is allowed, and names skills by skillId", () => {
    expect(
      policyToRules(
        withRow(
          "skills",
          { allow: [], deny: [], items: [{ id: SKILL, allow: ["use"], deny: [] }] },
          withRow("services", { allow: ["use"], deny: [], items: [] })
        )
      )
    ).toEqual([
      { subject: SERVICES, action: ["read", "use"] },
      { subject: SKILLS, action: ["read", "use"], conditions: { skillId: { $in: [SKILL] } } }
    ]);
  });

  it("writes the same rules however the policy lists its actions and services", () => {
    const a = withRow("services", {
      allow: ["use", "read"],
      deny: [],
      items: [
        { id: GITHUB, allow: ["edit", "read", "use"], deny: [] },
        { id: LINEAR, allow: ["use", "edit"], deny: [] }
      ]
    });
    const b = withRow("services", {
      allow: ["read", "use"],
      deny: [],
      items: [
        { id: LINEAR, allow: ["edit"], deny: [] },
        { id: GITHUB, allow: ["edit"], deny: [] },
        { id: GITHUB, allow: ["read"], deny: [] }
      ]
    });

    expect(policyToRules(a)).toEqual(policyToRules(b));
  });

  it("never writes the legacy action beside the ones that replaced it", () => {
    const rules = policyToRules(
      withRow("members", {
        allow: [
          "users.read",
          "users.grant-privileges",
          "users.assign-role",
          "groups.grant-privileges"
        ],
        deny: ["identities.grant-privileges", "identities.assign-role"]
      })
    );

    expect(rules).toEqual([
      { subject: "member", action: ["read", "assign-role"] },
      { subject: "groups", action: ["grant-privileges"] },
      { subject: "identity", action: ["assign-role"], inverted: true }
    ]);
  });
});

describe("round trips", () => {
  it.each(PERMISSION_ROWS.map((row) => [row.label, row] as const))(
    "reads back every named level of %s",
    (_label, row) => {
      row.levels.forEach((level) => {
        const policy = setRowLevel(empty(), row.key, level.value);
        expectRoundTrip(policy);
        expect(getRowLevel(rulesToPolicy(policyToRules(policy)).policy, row.key)).toBe(level.value);
      });
    }
  );

  it.each(
    PERMISSION_ROWS.filter(
      (row) =>
        row.actions.length <= 7 &&
        row.key !== "accessBundles" &&
        row.key !== "services" &&
        row.key !== "skills"
    ).map((row) => [row.label, row] as const)
  )("reads back every allow and deny set of %s", (_label, row) => {
    const canDeny = row.actions.every(({ subject }) => !SUBJECTS_WITHOUT_DENY.has(subject));
    everySplit(row.actions.map(({ key }) => key))
      .filter((sets) => canDeny || sets.deny.length === 0)
      .forEach((sets) => expectRoundTrip(withRow(row.key, sets)));
  });

  it("reads back allow and deny sets across the members row", () => {
    const row = PERMISSION_ROWS.find(({ key }) => key === "members");
    const keys = row?.actions.map(({ key }) => key) ?? [];
    expect(keys).toHaveLength(23);

    keys.forEach((key) => {
      expectRoundTrip(withRow("members", { allow: [key], deny: [] }));
      expectRoundTrip(withRow("members", { allow: [], deny: [key] }));
    });

    const pick = seededPicker(7);
    Array.from({ length: 400 }).forEach(() => {
      const sets: TActionSets = { allow: [], deny: [] };
      keys.forEach((key) => {
        const state = pick(3);
        if (state === 1) sets.allow.push(key);
        if (state === 2) sets.deny.push(key);
      });
      expectRoundTrip(withRow("members", sets));
    });
  });

  it.each(["services", "skills"] as const)(
    "reads back every allow and deny set for all %s beside listed ones",
    (rowKey) => {
      const itemSets: TActionSets[] = [
        { allow: [], deny: [] },
        { allow: ["read"], deny: [] },
        { allow: ["read", "use"], deny: [] },
        { allow: ["use"], deny: [] },
        { allow: ["read", "edit"], deny: [] },
        { allow: ["read", "use", "edit", "delete"], deny: [] },
        { allow: [], deny: ["read", "use", "edit", "delete"] },
        { allow: ["read", "use"], deny: ["delete"] },
        { allow: [], deny: ["use"] },
        { allow: ["delete"], deny: ["edit", "use"] }
      ];

      everySplit(["read", "use", "edit", "delete", "create"]).forEach((all) =>
        itemSets.forEach((first, index) =>
          expectRoundTrip(
            withRow(rowKey, {
              ...all,
              items: [
                { id: GITHUB, ...first },
                { id: LINEAR, ...itemSets[(index + 3) % itemSets.length] },
                { id: STRIPE, ...itemSets[(index + 7) % itemSets.length] }
              ]
            })
          )
        )
      );
    }
  );

  it("reads back a policy that sets every row at once", () => {
    expectRoundTrip({
      accessBundles: {
        allow: ["read", "create"],
        deny: [],
        items: [{ id: BUNDLE, allow: ["read", "use"], deny: [] }]
      },
      services: {
        allow: ["read", "use", "create"],
        deny: [],
        items: [
          { id: GITHUB, allow: ["read", "use", "edit", "delete"], deny: [] },
          { id: STRIPE, allow: [], deny: ["read", "use", "edit", "delete"] }
        ]
      },
      skills: {
        allow: [],
        deny: ["delete"],
        items: [{ id: SKILL, allow: ["read", "use"], deny: [] }]
      },
      sessions: { allow: ["read", "create", "edit", "revoke", "read-any"], deny: ["revoke-any"] },
      inlineServices: { allow: ["create-with-inline-services"], deny: [] },
      inlineSkills: { allow: ["create-with-inline-skills"], deny: [] },
      delegations: { allow: [], deny: [] },
      variables: { allow: ["read", "read-value"], deny: ["delete"] },
      proxies: { allow: ["read", "issue-token"], deny: [] },
      hooks: { allow: ["read"], deny: [] },
      members: {
        allow: ["users.read", "identities.read", "identities.get-token"],
        deny: ["groups.delete"]
      },
      roles: { allow: ["read"], deny: [] },
      appConnections: { allow: ["read-app-connections", "connect-app-connections"], deny: [] },
      sessionLogSettings: { allow: ["read"], deny: [] },
      auditLogs: { allow: ["read", "edit"], deny: [] },
      project: { allow: ["edit"], deny: [] }
    });
  });

  it.each(AGENT_VAULT_ROLE_TEMPLATES)("reads back the $name template", (template) => {
    expectRoundTrip(template.policy);
  });
});

describe("built-in roles", () => {
  it("reads the admin rule set with nothing unsupported, at the top of every row", () => {
    const { policy, unsupported } = rulesToPolicy(ADMIN_RULES);

    expect(unsupported).toEqual([]);
    PERMISSION_ROWS.forEach((row) =>
      expect(getRowLevel(policy, row.key)).toBe(row.levels[row.levels.length - 1].value)
    );
    expect(policy.accessBundles.allow).toContain("create");
    expect(policy.services.allow).toContain("create");
    expect(policy.skills.allow).toContain("create");
    PERMISSION_ROWS.forEach((row) =>
      expect(getRowSummary(policy, row.key, nameOf).access).toBe("full")
    );
  });

  it("builds the admin policy the API answers with other rules for", () => {
    const adminPolicy = rulesToPolicy(ADMIN_RULES).policy;
    expect(createFullAgentVaultPolicy()).toEqual(adminPolicy);
    expect(
      adminPolicy.hidden
        ?.flatMap(({ subject, action }) => action.map((name) => `${subject}|${name}`))
        .sort()
    ).toEqual([...IGNORED_ACTIONS].sort());
    expect(canonicalRulesKey(policyToRules(createFullAgentVaultPolicy()))).toBe(
      canonicalRulesKey(ADMIN_RULES)
    );
    expect(getBuiltInAgentVaultPolicy("admin")).toEqual(createFullAgentVaultPolicy());
    expect(getBuiltInAgentVaultPolicy("no-access")).toEqual(empty());
    expect(getBuiltInAgentVaultPolicy("release-engineers")).toBeUndefined();
  });

  it("writes a copy of admin the API accepts, which reads back the same", () => {
    const { policy } = rulesToPolicy(ADMIN_RULES);
    const rules = policyToRules(policy);
    const written = rules.flatMap(({ subject, action }) =>
      (action as string[]).map((name) => `${subject}|${name}`)
    );

    // The actions the editor hides go back as they were, so a copy of admin keeps them.
    expect(written.filter((id) => IGNORED_ACTIONS.includes(id)).sort()).toEqual(
      [...IGNORED_ACTIONS].sort()
    );
    expect(written.filter((id) => id.endsWith("|grant-privileges"))).toEqual([]);
    expect(rules.every((rule) => !rule.inverted && !rule.conditions)).toBe(true);
    expect(rulesToPolicy(rules)).toEqual({ policy, unsupported: [] });
    expect(canonicalRulesKey(rules)).toBe(canonicalRulesKey(ADMIN_RULES));
  });

  it("reads No Access as granting nothing", () => {
    const { policy, unsupported } = rulesToPolicy([]);

    expect(unsupported).toEqual([]);
    PERMISSION_ROWS.forEach((row) => expect(getRowLevel(policy, row.key)).toBe(NONE_LEVEL));
    PERMISSION_ROWS.forEach((row) =>
      expect(getRowSummary(policy, row.key, nameOf).access).toBe("none")
    );
  });
});

describe("rulesToPolicy", () => {
  it("implies nothing: a role with no rules can do nothing", () => {
    expect(rulesToPolicy([])).toEqual({ policy: empty(), unsupported: [] });
  });

  it("hides the actions nothing in Agent Vault offers, and writes them back unchanged", () => {
    const { policy, unsupported } = rulesToPolicy([
      { subject: "settings", action: ["create", "delete"] },
      { subject: BUNDLES, action: ["read"] }
    ]);

    expect(unsupported).toEqual([]);
    expect({ ...policy, hidden: undefined }).toEqual({
      ...withRow("accessBundles", { allow: ["read"], deny: [] }),
      hidden: undefined
    });
    expect(policyToRules(policy)).toEqual([
      { subject: BUNDLES, action: ["read"] },
      { subject: "settings", action: ["create", "delete"] }
    ]);
  });

  it("keeps a hidden deny through an edit in the visual editor, so a role can't widen on save", () => {
    // The backend widens a deny on assign-additional-privileges into a deny on grant-privileges.
    const rules: TProjectPermission[] = [
      { subject: "member", action: ["read", "grant-privileges"] },
      { subject: "member", action: ["assign-additional-privileges"], inverted: true }
    ];
    const { policy } = rulesToPolicy(rules);
    const edited = setRowLevel(policy, "proxies", "view");

    expect(policyToRules(edited)).toContainEqual({
      subject: "member",
      action: ["assign-additional-privileges"],
      inverted: true
    });
  });

  it("reports manage-members, which access bundles no longer take", () => {
    expect(reasonsOf([{ subject: BUNDLES, action: ["read", "manage-members"] }])).toEqual([
      'Uses manage-members on "agent-vault-access-bundles", which isn\'t an action a role can hold there.'
    ]);
  });

  it("reads use as carrying read, and nothing else as carrying anything", () => {
    const { policy, unsupported } = rulesToPolicy([
      { subject: SERVICES, action: ["use"], conditions: { serviceId: { $in: [GITHUB] } } },
      { subject: SKILLS, action: ["use"] },
      { subject: SESSIONS, action: ["create"] },
      { subject: SESSIONS, action: ["edit"], conditions: OTHERS_SESSIONS },
      { subject: VARIABLES, action: ["read-value"] }
    ]);

    expect(unsupported).toEqual([]);
    expect(policy.services.items).toEqual([{ id: GITHUB, allow: ["read", "use"], deny: [] }]);
    expect(policy.skills.allow).toEqual(["read", "use"]);
    expect(policy.sessions.allow).toEqual(["create", "edit-any"]);
    expect(policy.variables.allow).toEqual(["read-value"]);
  });

  it("keeps a skill hidden when use is denied on it and read only came with use, without denying read", () => {
    const rules: TProjectPermission[] = [
      { subject: SKILLS, action: ["use"] },
      {
        subject: SKILLS,
        action: ["use"],
        inverted: true,
        conditions: { skillId: { $in: [SKILL] } }
      }
    ];
    const { policy, unsupported } = rulesToPolicy(rules);

    expect(unsupported).toEqual([]);
    // Read stays implied: writing it for every skill would let this one be read, and a deny of read on it would
    // override another role that lets the member read it.
    expect(policy.skills.allow).toEqual(["use"]);
    expect(policy.skills.items).toEqual([{ id: SKILL, allow: [], deny: ["use"] }]);
    const saved = policyToRules(policy);
    expect(
      saved.filter((rule) => rule.inverted).flatMap((rule) => [rule.action].flat())
    ).not.toContain("read");
    expect(rulesToPolicy(saved).policy).toEqual(policy);
  });

  it("keeps every skill hidden when use is denied for all of them and read only came with use", () => {
    const rules: TProjectPermission[] = [
      { subject: SKILLS, action: ["use"] },
      { subject: SKILLS, action: ["use"], inverted: true }
    ];
    const { policy } = rulesToPolicy(rules);

    expect(policy.skills.allow).toEqual(["use"]);
    expect(policy.skills.deny).toEqual(["use"]);
    const saved = policyToRules(policy);
    expect(
      saved.filter((rule) => !rule.inverted).flatMap((rule) => [rule.action].flat())
    ).not.toContain("read");
    expect(rulesToPolicy(saved).policy).toEqual(policy);
  });

  describe("a skill whose use is denied while read only came with use", () => {
    const SHAPES: [string, TProjectPermission[]][] = [
      [
        "use on two skills, use denied on one",
        [
          {
            subject: SKILLS,
            action: ["use"],
            conditions: { skillId: { $in: [SKILL, OTHER_SKILL] } }
          },
          {
            subject: SKILLS,
            action: ["use"],
            inverted: true,
            conditions: { skillId: { $in: [SKILL] } }
          }
        ]
      ],
      [
        "use on one skill, use denied on every skill",
        [
          { subject: SKILLS, action: ["use"], conditions: { skillId: { $in: [SKILL] } } },
          { subject: SKILLS, action: ["use"], inverted: true }
        ]
      ]
    ];

    it.each(SHAPES)("stays hidden after an unrelated edit: %s", (_shape, rules) => {
      expect(canDoWith(rules, "read", SKILLS, { skillId: SKILL })).toBe(false);

      const saved = policyToRules(setRowLevel(rulesToPolicy(rules).policy, "proxies", "view"));

      expect(canDoWith(saved, "read", SKILLS, { skillId: SKILL })).toBe(false);
      expect(canDoWith(saved, "use", SKILLS, { skillId: SKILL })).toBe(false);
      expect(canDoWith(saved, "use", SKILLS, { skillId: OTHER_SKILL })).toBe(
        canDoWith(rules, "use", SKILLS, { skillId: OTHER_SKILL })
      );
    });

    it.each(SHAPES)("stays hidden in a copy: %s", (_shape, rules) => {
      expect(canDoWith(rulesForCopy(rules), "read", SKILLS, { skillId: SKILL })).toBe(false);
    });

    it.each(SHAPES)("reads back the rules it saved: %s", (_shape, rules) => {
      const { policy, unsupported } = rulesToPolicy(rules);

      expect(unsupported).toEqual([]);
      expectRoundTrip(policy);
    });
  });

  it("leaves a skill readable when use is denied on it but read was allowed on its own", () => {
    const { policy } = rulesToPolicy([
      { subject: SKILLS, action: ["read", "use"] },
      {
        subject: SKILLS,
        action: ["use"],
        inverted: true,
        conditions: { skillId: { $in: [SKILL] } }
      }
    ]);

    expect(policy.skills.items).toEqual([{ id: SKILL, allow: [], deny: ["use"] }]);
  });

  it("joins rules split across actions, services and operators", () => {
    const { policy, unsupported } = rulesToPolicy([
      { subject: SERVICES, action: "read" },
      { subject: [SERVICES], action: ["edit"], conditions: { serviceId: { $eq: GITHUB } } },
      { subject: SERVICES, action: ["use"], conditions: { serviceId: GITHUB } },
      { subject: SERVICES, action: ["use"], conditions: { serviceId: { $in: [LINEAR, GITHUB] } } },
      { subject: SERVICES, action: ["create"], conditions: {} },
      { subject: SESSIONS, action: ["read"], conditions: { actorId: SELF } },
      { subject: SESSIONS, action: ["create-with-inline-services", "create"], inverted: false }
    ]);

    expect(unsupported).toEqual([]);
    expect(policy.services).toEqual({
      allow: ["read", "create"],
      deny: [],
      items: [
        { id: LINEAR, allow: ["use"], deny: [] },
        { id: GITHUB, allow: ["use", "edit"], deny: [] }
      ].sort((a, b) => a.id.localeCompare(b.id))
    });
    expect(policy.sessions.allow).toEqual(["read", "create"]);
    expect(policy.inlineServices.allow).toEqual(["create-with-inline-services"]);
  });

  it("lists a service with what it adds to every service, and leaves out one that adds nothing", () => {
    const { policy } = rulesToPolicy([
      { subject: SERVICES, action: ["read", "use"] },
      { subject: SERVICES, action: ["edit"], conditions: { serviceId: { $in: [GITHUB] } } },
      { subject: SERVICES, action: ["read"], conditions: { serviceId: { $in: [LINEAR] } } },
      { subject: SERVICES, action: ["delete"], inverted: true },
      { subject: SERVICES, action: ["delete"], inverted: true, conditions: { serviceId: STRIPE } }
    ]);

    expect(policy.services.items).toEqual([{ id: GITHUB, allow: ["edit"], deny: [] }]);
    expect(getItemLevel(policy, "services", GITHUB)).toBe("edit");
  });

  it("lowers a service that only denies something along with every service", () => {
    const { policy } = rulesToPolicy([
      { subject: SERVICES, action: ["read", "use", "edit", "delete", "create"] },
      { subject: SERVICES, action: ["delete"], inverted: true, conditions: { serviceId: GITHUB } }
    ]);
    const lowered = setRowLevel(policy, "services", "view");

    expect(policyToRules(lowered).filter(({ subject }) => subject === SERVICES)).toEqual([
      { subject: SERVICES, action: ["read", "create"] },
      {
        subject: SERVICES,
        action: ["delete"],
        inverted: true,
        conditions: { serviceId: { $in: [GITHUB] } }
      }
    ]);
    expect(getItemLevel(lowered, "services", GITHUB)).toBe(CUSTOM_LEVEL);
  });

  it("keeps the level picked for a service when every service is lowered", () => {
    const all = setRowLevel(empty(), "services", "use");
    const picked = setItemLevel(
      addResourceItems(all, "services", [GITHUB]),
      "services",
      GITHUB,
      "use"
    );
    const lowered = setRowLevel(picked, "services", "view");

    expect(getItemLevel(lowered, "services", GITHUB)).toBe("use");
    expect(policyToRules(lowered).filter(({ subject }) => subject === SERVICES)).toEqual([
      { subject: SERVICES, action: ["read"] },
      { subject: SERVICES, action: ["read", "use"], conditions: { serviceId: { $in: [GITHUB] } } }
    ]);
  });

  it("reads denies everywhere: for all, for one service, and on any row", () => {
    const { policy, unsupported } = rulesToPolicy([
      { subject: SERVICES, action: ["read", "use", "edit", "delete"], inverted: true },
      {
        subject: SKILLS,
        action: ["use"],
        inverted: true,
        conditions: { skillId: { $in: [SKILL] } }
      },
      { subject: "member", action: ["delete"], inverted: true }
    ]);

    expect(unsupported).toEqual([]);
    expect(policy.services.deny).toEqual(["read", "use", "edit", "delete"]);
    expect(policy.skills.items).toEqual([{ id: SKILL, allow: [], deny: ["use"] }]);
    expect(policy.members).toEqual({ allow: [], deny: ["users.delete"] });
    expect(getRowLevel(policy, "members")).toBe(CUSTOM_LEVEL);
  });

  it("names a level only for exactly its actions with no denies", () => {
    const level = (rowKey: TCapabilityRowKey, sets: TActionSets) =>
      getRowLevel(withRow(rowKey, sets), rowKey);

    expect(level("sessions", { allow: ["read", "create", "edit", "revoke"], deny: [] })).toBe(
      "own"
    );
    expect(level("sessions", { allow: ["read", "create", "edit"], deny: [] })).toBe(CUSTOM_LEVEL);
    expect(
      level("sessions", { allow: ["read", "create", "edit", "revoke"], deny: ["read-any"] })
    ).toBe(CUSTOM_LEVEL);
    expect(
      level("appConnections", {
        allow: ["read-app-connections", "connect-app-connections"],
        deny: []
      })
    ).toBe("use");
    expect(getRowLevel(withRow("services", { allow: ["read", "use", "create"] }), "services")).toBe(
      "use"
    );
    expect(
      getRowLevel(withRow("services", { allow: ["read"], deny: ["create"] }), "services")
    ).toBe(CUSTOM_LEVEL);
  });
});

describe("rulesToPolicy reports what a role can't hold", () => {
  it("reports a subject outside Agent Vault", () => {
    expect(reasonsOf([{ subject: "secrets", action: ["read"] }])).toEqual([
      'Applies to "secrets", which a role in Agent Vault doesn\'t use.'
    ]);
  });

  it("reports an action the admin role doesn't hold on that subject", () => {
    expect(
      reasonsOf([
        { subject: SERVICES, action: ["read", "rotate"] },
        { subject: "app-connections", action: ["rotate-credentials"] },
        { subject: "workspace", action: ["read"] },
        { subject: SESSIONS, action: ["manage-members"] }
      ])
    ).toEqual([
      `Uses rotate on "${SERVICES}", which isn't an action a role can hold there.`,
      'Uses rotate-credentials on "app-connections", which isn\'t an action a role can hold there.',
      'Uses read on "workspace", which isn\'t an action a role can hold there.',
      `Uses manage-members on "${SESSIONS}", which isn't an action a role can hold there.`
    ]);
  });

  it("reports a condition the row doesn't take", () => {
    expect(
      reasonsOf([
        { subject: "member", action: ["read"], conditions: { userEmail: "a@b.c" } },
        { subject: SESSIONS, action: ["read"], conditions: { serviceId: GITHUB } },
        { subject: SESSIONS, action: ["read"], conditions: { actorId: { $eq: GITHUB } } },
        { subject: SESSIONS, action: ["read", "create"], conditions: OWN_SESSIONS },
        { subject: SESSIONS, action: ["read-any"] },
        { subject: SERVICES, action: ["read"], conditions: { name: "github" } },
        { subject: SKILLS, action: ["read"], conditions: { serviceId: GITHUB } },
        { subject: SERVICES, action: ["read"], conditions: { serviceId: { $glob: "*" } } },
        { subject: SERVICES, action: ["read"], conditions: { serviceId: { $in: ["github"] } } },
        { subject: SERVICES, action: ["read"], conditions: { serviceId: { $in: [] } } },
        { subject: SERVICES, action: ["read"], conditions: { serviceId: { $in: GITHUB } } },
        {
          subject: SERVICES,
          action: ["read"],
          conditions: { serviceId: { $eq: GITHUB, $in: [GITHUB] } }
        },
        { subject: SERVICES, action: ["read"], conditions: { serviceId: 7 } },
        { subject: SKILLS, action: ["read"], conditions: { skillId: SKILL.toUpperCase() } }
      ])
    ).toEqual([
      'Limits "member" with a condition, which only access bundles, services and skills take.',
      'Limits sessions by "serviceId". Only actorId is supported.',
      `Limits sessions by actorId with something other than $eq or $ne on ${SELF}.`,
      "Limits create on sessions by who started them, which only read, edit and revoke take.",
      `Uses read-any on "${SESSIONS}", which isn't an action a role can hold there.`,
      'Limits services by "name". Only serviceId is supported.',
      'Limits skills by "serviceId". Only skillId is supported.',
      "Limits services with the $glob operator.",
      "Names services by something other than a lowercase ID.",
      "Limits services to an empty list.",
      "Limits services with $in without a list.",
      "Limits services with more than one operator.",
      "Limits services with a value that is neither an ID nor an operator.",
      "Names skills by something other than a lowercase ID."
    ]);
  });

  it("reports create limited to specific services", () => {
    const { policy, unsupported } = rulesToPolicy([
      {
        subject: SERVICES,
        action: ["read", "create"],
        conditions: { serviceId: { $in: [GITHUB] } }
      }
    ]);

    expect(unsupported.map(({ reason }) => reason)).toEqual([
      "Limits create to specific services, which isn't possible."
    ]);
    expect(policy.services.items).toEqual([{ id: GITHUB, allow: ["read"], deny: [] }]);
  });

  it("reports rules it can't read at all", () => {
    expect(
      reasonsOf([
        "nope" as unknown as TProjectPermission,
        { action: ["read"] } as unknown as TProjectPermission,
        { subject: ["member", "groups"], action: ["read"] },
        { subject: "member" } as unknown as TProjectPermission,
        { subject: "member", action: [1] } as unknown as TProjectPermission,
        { subject: "member", action: ["read"], inverted: "yes" } as unknown as TProjectPermission,
        { subject: "member", action: ["read"], fields: ["email"] } as unknown as TProjectPermission,
        { subject: "member", action: ["read"], conditions: "x" } as unknown as TProjectPermission
      ])
    ).toEqual([
      "Isn't a rule: each rule is an object with a subject and actions.",
      "Names no subject, or more than one.",
      "Names no subject, or more than one.",
      'Has no list of actions on "member".',
      'Has no list of actions on "member".',
      'Sets "inverted" on "member" to something other than true or false.',
      'Limits "member" to some fields, which Agent Vault doesn\'t use.',
      'Has conditions on "member" that aren\'t an object.'
    ]);
  });

  it("returns the rule itself, and keeps the rest of the role readable", () => {
    const bad: TProjectPermission = { subject: "secrets", action: ["read"] };
    const { policy, unsupported } = rulesToPolicy([
      { subject: PROXIES, action: ["read", "bogus"] },
      bad,
      { subject: SESSIONS, action: ["read"], conditions: OWN_SESSIONS }
    ]);

    expect(unsupported.map(({ rule }) => rule)).toEqual([
      { subject: PROXIES, action: ["read", "bogus"] },
      bad
    ]);
    expect(policy.proxies.allow).toEqual(["read"]);
    expect(policy.sessions.allow).toEqual(["read"]);
  });
});

describe("canonicalRulesKey", () => {
  it("matches rules that grant the same thing however they are written", () => {
    const seed: TProjectPermission[] = [
      {
        subject: SERVICES,
        action: ["read", "use"],
        conditions: { serviceId: { $in: [GITHUB] } },
        inverted: false
      },
      { subject: SESSIONS, action: ["read", "create", "edit", "revoke"], inverted: false },
      { subject: BUNDLES, action: ["read"], inverted: false },
      { subject: PROXIES, action: ["read"], inverted: false }
    ];
    const split: TProjectPermission[] = [
      { subject: PROXIES, action: "read" },
      { subject: SESSIONS, action: ["revoke", "edit"] },
      { subject: BUNDLES, action: "read" },
      { subject: SERVICES, action: ["use"], conditions: { serviceId: GITHUB } },
      { subject: SESSIONS, action: ["create", "read"] }
    ];

    expect(canonicalRulesKey(split)).toBe(canonicalRulesKey(seed));
    expect(canonicalRulesKey(policyToRules(rulesToPolicy(seed).policy))).toBe(
      canonicalRulesKey(seed)
    );
  });

  it("tells apart rules that grant different things", () => {
    expect(canonicalRulesKey([{ subject: SERVICES, action: ["read"] }])).not.toBe(
      canonicalRulesKey([{ subject: SERVICES, action: ["read", "use"] }])
    );
    expect(canonicalRulesKey([{ subject: PROXIES, action: ["read"] }])).not.toBe(
      canonicalRulesKey([{ subject: PROXIES, action: ["read"], inverted: true }])
    );
    expect(canonicalRulesKey([{ subject: "secrets", action: ["read"] }])).not.toBe(
      canonicalRulesKey([])
    );
  });
});

describe("editing", () => {
  const sessions = { rowKey: "sessions" } as const;

  it("ticks read with any action, and whatever else the action needs", () => {
    expect(setActionAllowed(empty(), sessions, "edit-any", true).sessions.allow).toEqual([
      "read",
      "edit",
      "read-any",
      "edit-any"
    ]);
    expect(setActionAllowed(empty(), sessions, "revoke-any", true).sessions.allow).toEqual([
      "read",
      "revoke",
      "read-any",
      "revoke-any"
    ]);
    expect(
      setActionAllowed(empty(), { rowKey: "variables" }, "read-value", true).variables.allow
    ).toEqual(["read", "read-value"]);
    expect(
      setActionAllowed(empty(), { rowKey: "proxies" }, "issue-token", true).proxies.allow
    ).toEqual(["read", "issue-token"]);
    expect(
      setActionAllowed(empty(), { rowKey: "appConnections" }, "connect-app-connections", true)
        .appConnections.allow
    ).toEqual(["read-app-connections", "connect-app-connections"]);
    expect(
      setActionAllowed(empty(), { rowKey: "members" }, "identities.create-token", true).members
        .allow
    ).toEqual(["identities.read", "identities.create-token"]);
    expect(setActionAllowed(empty(), { rowKey: "project" }, "delete", true).project.allow).toEqual([
      "delete"
    ]);
  });

  it("locks an action while something that needs it is ticked", () => {
    const policy = setActionAllowed(empty(), sessions, "edit-any", true);

    expect(getActionState(policy, sessions, "read").allowLock).toBe(
      "Needed by Edit Own, View Everyone's, Edit Everyone's"
    );
    expect(getActionState(policy, sessions, "read-any").allowLock).toBe(
      "Needed by Edit Everyone's"
    );
    expect(getActionState(policy, sessions, "edit-any").allowLock).toBeUndefined();
    expect(getActionState(policy, sessions, "create")).toEqual({
      isAllowed: false,
      isDenied: false,
      allowLock: undefined,
      denyLock: undefined
    });
  });

  it("unticks whatever needed an action along with it", () => {
    const policy = setRowLevel(empty(), "sessions", "manage-all");

    expect(setActionAllowed(policy, sessions, "read-any", false).sessions.allow).toEqual([
      "read",
      "create",
      "edit",
      "revoke"
    ]);
    expect(setActionAllowed(policy, sessions, "read", false).sessions.allow).toEqual([]);
  });

  it("ties inline services to starting sessions, across the two rows", () => {
    const inline = setRowLevel(empty(), "inlineServices", "yes");

    expect(inline.sessions.allow).toEqual(["read", "create"]);
    expect(getActionState(inline, sessions, "create").allowLock).toBe(
      "Needed by Start With Inline Services"
    );
    expect(setRowLevel(inline, "sessions", NONE_LEVEL).inlineServices.allow).toEqual([]);
    expect(setRowLevel(inline, "sessions", "own").inlineServices.allow).toEqual([
      "create-with-inline-services"
    ]);
  });

  it("denies whatever needs a denied action, and stops allowing both", () => {
    const policy = setActionDenied(
      setRowLevel(setRowLevel(empty(), "sessions", "manage-all"), "inlineServices", "yes"),
      sessions,
      "read",
      true
    );

    expect(policy.sessions).toEqual({
      allow: [],
      deny: ["read", "create", "edit", "revoke", "read-any", "edit-any", "revoke-any"]
    });
    expect(policy.inlineServices).toEqual({ allow: [], deny: ["create-with-inline-services"] });

    const partial = setActionDenied(
      setRowLevel(empty(), "sessions", "manage-all"),
      sessions,
      "revoke",
      true
    );
    expect(partial.sessions).toEqual({
      allow: ["read", "create", "edit", "read-any", "edit-any"],
      deny: ["revoke", "revoke-any"]
    });
    expect(setActionDenied(partial, sessions, "revoke", false).sessions.deny).toEqual([
      "revoke-any"
    ]);
  });

  it("allowing an action lifts the deny on it and on what it needs", () => {
    const denied = setActionDenied(empty(), sessions, "read", true);
    const policy = setActionAllowed(denied, sessions, "create", true);

    expect(policy.sessions.allow).toEqual(["read", "create"]);
    expect(policy.sessions.deny).toEqual(["edit", "revoke", "read-any", "edit-any", "revoke-any"]);
  });

  it("sets a named level to exactly its actions and clears denies", () => {
    const messy = withRow("proxies", { allow: ["read", "issue-token"], deny: ["delete"] });

    expect(setRowLevel(messy, "proxies", "view").proxies).toEqual({ allow: ["read"], deny: [] });
    expect(setRowLevel(messy, "proxies", NONE_LEVEL).proxies).toEqual({ allow: [], deny: [] });
    expect(getRowLevel(setRowLevel(messy, "proxies", "manage"), "proxies")).toBe("manage");
  });

  it("keeps create beside the level for all services, until they can't be viewed", () => {
    const creating = setActionAllowed(empty(), { rowKey: "services" }, "create", true);

    expect(creating.services.allow).toEqual(["read", "create"]);
    expect(getRowLevel(creating, "services")).toBe("view");
    expect(setRowLevel(creating, "services", "edit").services.allow).toEqual([
      "read",
      "use",
      "edit",
      "create"
    ]);
    expect(setRowLevel(creating, "services", NONE_LEVEL).services.allow).toEqual([]);
  });

  it("starts a picked service at a level that holds nothing denied for every service", () => {
    const denyUseForAll = setActionDenied(empty(), { rowKey: "services" }, "use", true);

    expect(getDefaultItemLevel(denyUseForAll, "services")).toBe("view");
    expect(
      getItemLevel(addResourceItems(denyUseForAll, "services", [GITHUB]), "services", GITHUB)
    ).toBe("view");
    expect(
      getDefaultItemLevel(
        setActionDenied(empty(), { rowKey: "services" }, "read", true),
        "services"
      )
    ).toBe(DENIED_LEVEL);
  });

  it("starts a picked service at the first level that adds something", () => {
    expect(getDefaultItemLevel(empty(), "services")).toBe("use");
    expect(getDefaultItemLevel(setRowLevel(empty(), "services", "view"), "services")).toBe("use");
    expect(getDefaultItemLevel(setRowLevel(empty(), "services", "use"), "services")).toBe("edit");
    expect(getDefaultItemLevel(setRowLevel(empty(), "services", "manage"), "services")).toBe(
      DENIED_LEVEL
    );

    const added = addResourceItems(empty(), "services", [GITHUB, LINEAR, GITHUB]);
    expect(added.services.items).toEqual([
      { id: GITHUB, allow: ["read", "use"], deny: [] },
      { id: LINEAR, allow: ["read", "use"], deny: [] }
    ]);
  });

  it("edits one service on its own, never touching create", () => {
    const service = { rowKey: "services", itemId: GITHUB } as const;
    const base = addResourceItems(setRowLevel(empty(), "services", "view"), "services", [GITHUB]);

    expect(getItemLevel(base, "services", GITHUB)).toBe("use");
    expect(getActionState(base, service, "read").allowLock).toBe("Allowed for all services");

    const edited = setActionAllowed(
      setItemLevel(base, "services", GITHUB, "view"),
      service,
      "edit",
      true
    );
    expect(edited.services.items[0]).toEqual({ id: GITHUB, allow: ["read", "edit"], deny: [] });
    expect(getItemLevel(edited, "services", GITHUB)).toBe(CUSTOM_LEVEL);

    const denied = setActionDenied(edited, service, "read", true);
    expect(denied.services.items[0]).toEqual({
      id: GITHUB,
      allow: [],
      deny: ["read", "use", "edit", "delete"]
    });
    expect(getItemLevel(denied, "services", GITHUB)).toBe(DENIED_LEVEL);
    expect(setItemLevel(denied, "services", GITHUB, "manage").services.items[0]).toEqual({
      id: GITHUB,
      allow: ["read", "use", "edit", "delete"],
      deny: []
    });
  });

  it("marks a listed service that gets nothing extra", () => {
    const policy = addResourceItems(empty(), "services", [GITHUB]);

    expect(isItemRedundant(policy, "services", GITHUB)).toBe(false);
    expect(isItemRedundant(setRowLevel(policy, "services", "use"), "services", GITHUB)).toBe(true);
    expect(policyToRules(setRowLevel(policy, "services", "use"))).toEqual([
      { subject: SERVICES, action: ["read", "use"] }
    ]);
  });

  it("swaps the legacy action for the ones that replaced it", () => {
    const members = { rowKey: "members" } as const;
    const legacy = setActionAllowed(empty(), members, "users.grant-privileges", true);

    expect(legacy.members.allow).toEqual(["users.read", "users.grant-privileges"]);
    const upgraded = setActionAllowed(legacy, members, "users.assign-role", true);
    expect(upgraded.members.allow).toEqual(["users.read", "users.assign-role"]);
    expect(getActionState(upgraded, members, "users.grant-privileges").allowLock).toBe(
      "Replaced by Assign Roles"
    );
  });
});

describe("warnings", () => {
  it("says sessions never work when a role can start them but not view its own", () => {
    const { policy } = rulesToPolicy([
      { subject: SESSIONS, action: ["create"] },
      { subject: SESSIONS, action: ["edit"], conditions: OWN_SESSIONS }
    ]);

    expect(getRowWarnings(policy, "sessions")).toEqual([
      {
        itemId: undefined,
        message:
          "Sessions can be started, but a session only works while its owner can view their own. Allow View Own."
      }
    ]);
  });

  it("names what else stored rules are missing, in the row that misses it", () => {
    const { policy } = rulesToPolicy([
      { subject: SESSIONS, action: ["read"], conditions: OWN_SESSIONS },
      { subject: SESSIONS, action: ["edit", "revoke"], conditions: OTHERS_SESSIONS },
      { subject: SESSIONS, action: ["create-with-inline-services"] },
      { subject: VARIABLES, action: ["read-value"] },
      { subject: SERVICES, action: ["edit"], conditions: { serviceId: { $in: [GITHUB] } } },
      { subject: PROXIES, action: ["read", "delete"] },
      { subject: PROXIES, action: ["read"], inverted: true }
    ]);

    expect(getRowWarnings(policy, "sessions").map(({ message }) => message)).toEqual([
      "Edit Everyone's needs Edit Own.",
      "Edit Everyone's and Revoke Everyone's need View Everyone's.",
      "Revoke Everyone's needs Revoke Own."
    ]);
    expect(getRowWarnings(policy, "inlineServices").map(({ message }) => message)).toEqual([
      "Start With Inline Services needs Start in Sessions."
    ]);
    expect(getRowWarnings(policy, "variables").map(({ message }) => message)).toEqual([
      "View Values needs View Names."
    ]);
    expect(getRowWarnings(policy, "services")).toEqual([
      { itemId: GITHUB, message: "Edit needs View." }
    ]);
    expect(getRowWarnings(policy, "proxies").map(({ message }) => message)).toEqual([
      "Delete needs View."
    ]);
  });

  it("lets a person's own policy lean on their role, except for what the policy denies", () => {
    const { policy } = rulesToPolicy([
      { subject: SESSIONS, action: ["create"] },
      { subject: VARIABLES, action: ["read-value"] },
      { subject: PROXIES, action: ["read", "delete"] },
      { subject: PROXIES, action: ["read"], inverted: true }
    ]);
    const messages = (rowKey: TPermissionRowKey) =>
      getRowWarnings(policy, rowKey, "policy").map(({ message }) => message);

    expect(messages("sessions")).toEqual([
      "Sessions can be started, but a session only works while its owner can view their own. Allow View Own unless their roles already do."
    ]);
    expect(messages("variables")).toEqual([
      "View Values needs View Names, unless their roles already allow it."
    ]);
    expect(messages("proxies")).toEqual(["Delete needs View."]);
  });

  it("has nothing to say about levels and edits", () => {
    const policy = setActionAllowed(
      setRowLevel(setRowLevel(empty(), "sessions", "manage-all"), "inlineServices", "yes"),
      { rowKey: "members" },
      "groups.assign-role",
      true
    );

    PERMISSION_ROWS.forEach((row) => expect(getRowWarnings(policy, row.key)).toEqual([]));
    AGENT_VAULT_ROLE_TEMPLATES.forEach((template) =>
      PERMISSION_ROWS.forEach((row) => expect(getRowWarnings(template.policy, row.key)).toEqual([]))
    );
  });

  it("flags the rows that reach past their holder", () => {
    const risky = (rowKey: TPermissionRowKey, level: string) =>
      Boolean(getRowRisk(setRowLevel(empty(), rowKey, level), rowKey));

    expect(risky("sessions", "see-all")).toBe(false);
    expect(risky("sessions", "manage-all")).toBe(true);
    expect(risky("inlineServices", "yes")).toBe(true);
    expect(risky("variables", "view-names")).toBe(false);
    expect(risky("variables", "view-values")).toBe(true);
    expect(risky("variables", "full")).toBe(true);
    expect(risky("members", "view")).toBe(false);
    expect(risky("members", "manage")).toBe(true);
    expect(risky("members", "full")).toBe(true);
    expect(risky("roles", "view")).toBe(false);
    expect(risky("roles", "manage")).toBe(true);
    expect(risky("project", "edit")).toBe(false);
    expect(risky("project", "edit-delete")).toBe(true);
    expect(risky("proxies", "manage")).toBe(false);
  });
});

describe("access bundles", () => {
  it("reads and writes bundle rules by id, the way services take them", () => {
    const rules = [
      { subject: BUNDLES, action: ["read", "create"] },
      {
        subject: BUNDLES,
        action: ["read", "use"],
        conditions: { accessBundleId: { $in: [BUNDLE] } }
      }
    ];
    const { policy, unsupported } = rulesToPolicy(rules);

    expect(unsupported).toEqual([]);
    expect(getItemLevel(policy, "accessBundles", BUNDLE)).toBe("use");
    expect(policyToRules(policy)).toEqual(rules);
  });

  it("lets holders who use a bundle start sessions only when the role says so", () => {
    const usesBundle = addResourceItems(empty(), "accessBundles", [BUNDLE]);

    expect(getPolicyWarning(usesBundle, "role")).toMatch(/doesn't let them start sessions/);
    expect(getPolicyWarning(setRowLevel(usesBundle, "sessions", "own"), "role")).toBeUndefined();
  });
});

describe("summaries", () => {
  const seed = rulesToPolicy([
    {
      subject: SERVICES,
      action: ["read", "use"],
      conditions: { serviceId: { $in: [GITHUB, LINEAR] } }
    },
    {
      subject: SERVICES,
      action: ["read", "use", "edit", "delete"],
      inverted: true,
      conditions: { serviceId: { $in: [STRIPE] } }
    },
    ...MEMBER_RULES
  ]).policy;
  const summary = (policy: TAgentVaultPolicy, rowKey: TPermissionRowKey) =>
    getRowSummary(policy, rowKey, nameOf);

  it("sums up a row as how much it grants, with a line per thing it grants or denies", () => {
    expect(summary(seed, "services")).toEqual({
      access: "limited",
      details: ["Use: github, linear", "Denied: stripe"]
    });
    expect(summary(seed, "sessions")).toEqual({ access: "limited", details: ["Own Sessions"] });
    expect(summary(seed, "roles")).toEqual({ access: "none", details: [] });
    expect(summary(setRowLevel(empty(), "proxies", "manage"), "proxies")).toEqual({
      access: "full",
      details: ["Manage"]
    });
    expect(
      summary(
        setActionAllowed(
          setRowLevel(empty(), "services", "use"),
          { rowKey: "services" },
          "create",
          true
        ),
        "services"
      )
    ).toEqual({ access: "limited", details: ["All services: Use", "Can create services"] });
    expect(
      summary(
        setActionAllowed(
          setRowLevel(empty(), "services", "manage"),
          { rowKey: "services" },
          "create",
          true
        ),
        "services"
      )
    ).toEqual({ access: "full", details: ["All services: Full Control", "Can create services"] });
  });

  it("spells out custom rows action by action", () => {
    expect(
      summary(withRow("sessions", { allow: ["read", "create"], deny: ["revoke"] }), "sessions")
    ).toEqual({ access: "limited", details: ["View Own, Start", "Denied: Revoke Own"] });
    expect(
      summary(
        withRow("members", { allow: ["users.read", "users.create", "groups.read"], deny: [] }),
        "members"
      )
    ).toEqual({ access: "limited", details: ["Users: View, Add", "Groups: View"] });
    expect(
      summary(
        withRow("skills", {
          allow: ["read", "edit"],
          deny: [],
          items: [{ id: SKILL, allow: ["read", "delete"], deny: [] }]
        }),
        "skills"
      )
    ).toEqual({ access: "limited", details: ["All skills: View, Edit", "Custom: triage"] });
  });

  it("marks a row that only denies, and says what it denies", () => {
    expect(
      summary(withRow("variables", { allow: [], deny: ["read", "read-value"] }), "variables")
    ).toEqual({ access: "denied", details: ["Denied: View Names, View Values"] });
    expect(
      summary(withRow("services", { allow: [], deny: ["delete"], items: [] }), "services")
    ).toEqual({ access: "denied", details: ["Denied for all services: Delete"] });
    expect(
      summary(withRow("services", { allow: ["read"], deny: ["create"], items: [] }), "services")
    ).toEqual({ access: "limited", details: ["All services: View", "Can't create services"] });
  });

  it("lists a service picked at Use as custom while use is denied for every service", () => {
    const denyUseForAll = setActionDenied(empty(), { rowKey: "services" }, "use", true);
    const picked = setItemLevel(
      addResourceItems(denyUseForAll, "services", [GITHUB]),
      "services",
      GITHUB,
      "use"
    );

    expect(getItemLevel(picked, "services", GITHUB)).toBe(CUSTOM_LEVEL);
    expect(summary(picked, "services").details).toEqual([
      "Denied for all services: Use",
      "Custom: github"
    ]);
  });

  it("warns when a role lets holders use services but not start sessions", () => {
    const useOnly = addResourceItems(empty(), "services", [GITHUB]);

    expect(getPolicyWarning(useOnly, "role")).toMatch(/doesn't let them start sessions/);
    expect(getPolicyWarning(setRowLevel(useOnly, "sessions", "own"), "role")).toBeUndefined();
    expect(
      getPolicyWarning(withRow("sessions", { allow: [], deny: ["create"] }, useOnly), "role")
    ).toMatch(/doesn't let them start sessions/);
    expect(getPolicyWarning(setRowLevel(empty(), "services", "view"), "role")).toBeUndefined();
    expect(getPolicyWarning(useOnly, "policy")).toBeUndefined();
  });

  it("leaves sessions that start but never work to the Sessions row", () => {
    const startOnly = withRow(
      "sessions",
      { allow: ["create"], deny: [] },
      addResourceItems(empty(), "services", [GITHUB])
    );

    expect(getPolicyWarning(startOnly, "role")).toBeUndefined();
    expect(getRowWarnings(startOnly, "sessions")).toHaveLength(1);
  });
});

describe("templates", () => {
  const template = (id: string) =>
    AGENT_VAULT_ROLE_TEMPLATES.find((candidate) => candidate.id === id)?.policy ?? empty();
  it("carry the basics explicitly", () => {
    AGENT_VAULT_ROLE_TEMPLATES.forEach(({ policy }) => {
      expect(policy.sessions.allow).toEqual(
        expect.arrayContaining(["read", "create", "edit", "revoke"])
      );
      expect(policy.inlineSkills.allow).toEqual(["create-with-inline-skills"]);
      expect(policy.proxies.allow).toContain("read");
    });
  });

  it("grant what their names say", () => {
    const ownSessions: TProjectPermission[] = [
      { subject: SESSIONS, action: ["create", "create-with-inline-skills"] },
      { subject: SESSIONS, action: ["read", "edit", "revoke"], conditions: OWN_SESSIONS }
    ];
    expect(policyToRules(template("service-user"))).toEqual([
      ...ownSessions,
      { subject: PROXIES, action: ["read"] },
      { subject: HOOKS, action: ["read"] }
    ]);
    expect(policyToRules(template("builder"))).toEqual([
      { subject: SERVICES, action: ["read", "use", "edit", "create"] },
      { subject: BUNDLES, action: ["read", "use", "edit", "create"] },
      ...ownSessions,
      { subject: PROXIES, action: ["read"] },
      { subject: HOOKS, action: ["read"] }
    ]);
    expect(policyToRules(template("auditor"))).toEqual([
      { subject: SESSIONS, action: ["create", "create-with-inline-skills", "read"] },
      { subject: SESSIONS, action: ["edit", "revoke"], conditions: OWN_SESSIONS },
      { subject: PROXIES, action: ["read"] },
      { subject: HOOKS, action: ["read"] },
      { subject: "member", action: ["read"] },
      { subject: "groups", action: ["read"] },
      { subject: "identity", action: ["read"] },
      { subject: "settings", action: ["read"] },
      { subject: "audit-logs", action: ["read"] }
    ]);
    expect(getRowLevel(template("proxy-operator"), "proxies")).toBe("manage");
  });

  it("start a Service User with what the Member role the role migration makes grants", () => {
    expect(canonicalRulesKey(policyToRules(template("service-user")))).toBe(
      canonicalRulesKey(MEMBER_RULES)
    );
  });
});

describe("a Member role", () => {
  it("reads as own sessions with skills sent along, and viewing proxies and hooks", () => {
    const { policy, unsupported } = rulesToPolicy(MEMBER_RULES);
    const levels = Object.fromEntries(
      PERMISSION_ROWS.map((row) => [row.key, getRowLevel(policy, row.key)])
    );

    expect(unsupported).toEqual([]);
    expect(levels).toEqual({
      accessBundles: NONE_LEVEL,
      services: NONE_LEVEL,
      skills: NONE_LEVEL,
      sessions: "own",
      inlineServices: NONE_LEVEL,
      inlineSkills: "yes",
      delegations: NONE_LEVEL,
      variables: NONE_LEVEL,
      proxies: "view",
      hooks: "view",
      members: NONE_LEVEL,
      roles: NONE_LEVEL,
      appConnections: NONE_LEVEL,
      sessionLogSettings: NONE_LEVEL,
      auditLogs: NONE_LEVEL,
      project: NONE_LEVEL
    });
  });
});

describe("parseRulesJson", () => {
  it("returns the rules as written", () => {
    const rules = [{ subject: "secrets", action: ["read"], extra: true }];
    expect(parseRulesJson(JSON.stringify(rules))).toEqual({ rules });
  });

  it("explains JSON it can't use", () => {
    expect(parseRulesJson("[{")).toHaveProperty("error");
    expect(parseRulesJson("{}")).toEqual({ error: "Rules must be a JSON array." });
    expect(parseRulesJson('[{"subject":"member"}, 3]')).toEqual({
      error: "Rule 2 must be an object."
    });
  });
});

describe("formatRulesJson", () => {
  it("reads the same for the rules it was given and for what the API returns after saving them", () => {
    const rules = policyToRules(
      setActionDenied(
        setItemLevel(addResourceItems(empty(), "services", [GITHUB]), "services", GITHUB, "use"),
        { rowKey: "proxies" },
        "delete",
        true
      )
    );
    const returned = rules.map(({ subject, action, conditions, inverted }) => ({
      action,
      inverted: inverted ?? false,
      ...(conditions ? { conditions } : {}),
      subject
    }));

    expect(formatRulesJson(returned)).toBe(formatRulesJson(rules));
    expect(JSON.parse(formatRulesJson(returned))).toEqual(rules);
  });

  it("keeps everything else a rule holds", () => {
    const rules = [{ note: "kept", subject: "secrets", action: ["read"], inverted: true }];

    expect(JSON.parse(formatRulesJson(rules))).toEqual(rules);
    expect(Object.keys(JSON.parse(formatRulesJson(rules))[0])).toEqual([
      "subject",
      "action",
      "inverted",
      "note"
    ]);
  });
});

describe("members and roles", () => {
  it("allows viewing roles along with assigning them, so the role picker has roles to show", () => {
    const policy = setRowLevel(empty(), "members", "full");
    expect(policy.roles.allow).toContain("read");
    expect(
      setActionAllowed(empty(), { rowKey: "members" }, "groups.assign-role", true).roles.allow
    ).toEqual(["read"]);
  });

  it("lists the legacy Grant Privileges action only while a role holds it", () => {
    const legacy = PERMISSION_ROWS.find(({ key }) => key === "members")?.actions.find(
      ({ key }) => key === "users.grant-privileges"
    );
    if (!legacy) throw new Error("users.grant-privileges is missing from the catalog");

    expect(isActionListed(empty(), { rowKey: "members" }, legacy)).toBe(false);
    const holding = rulesToPolicy([
      { subject: "member", action: ["read", "grant-privileges"] }
    ]).policy;
    expect(isActionListed(holding, { rowKey: "members" }, legacy)).toBe(true);
  });
});

describe("subjects the API can't save a deny on", () => {
  const roles = { rowKey: "roles" as TPermissionRowKey };

  it("never ticks Deny there, and says why", () => {
    const policy = setRowLevel(empty(), "roles", "manage");
    expect(setActionDenied(policy, roles, "edit", true)).toBe(policy);
    expect(getActionState(policy, roles, "edit").denyLock).toBe(
      "This permission can't be denied. Leave Allow unticked instead."
    );
  });

  it("never writes an inverted rule for them, even from a stored deny", () => {
    const policy = withRow("roles", { allow: ["read"], deny: ["edit"] });
    const written = policyToRules(policy).filter((rule) =>
      ["role", "settings", "audit-logs", "workspace"].includes(rule.subject as string)
    );
    expect(written.some((rule) => rule.inverted)).toBe(false);
  });

  it("refuses a deny on them in JSON, since the API would save it as an allow", () => {
    expect(
      reasonsOf([{ subject: "role", action: ["edit"], inverted: true } as TProjectPermission])
    ).toEqual([
      'Denies "role", which Infisical can\'t save as a deny, so it would allow it instead. Remove the rule, or leave the action out of an allow.'
    ]);
  });
});

describe("a group of more ids than one condition can name", () => {
  const ids = Array.from(
    { length: 1200 },
    (_, n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
  );
  const useEach = (count: number): TProjectPermission[] => [
    { subject: SERVICES, action: ["use"], conditions: { serviceId: { $in: ids.slice(0, 600) } } },
    {
      subject: SERVICES,
      action: ["use"],
      conditions: { serviceId: { $in: ids.slice(600, count) } }
    }
  ];
  const named = (rules: TProjectPermission[]) =>
    rules
      .filter((rule) => rule.subject === SERVICES && rule.conditions)
      .map((rule) => (rule.conditions as { serviceId: { $in: string[] } }).serviceId.$in);

  it("is written as several rules of at most the API's limit, on save and on Duplicate", () => {
    const { policy } = rulesToPolicy(useEach(1200));
    for (const rules of [policyToRules(policy), rulesForCopy(useEach(1200))]) {
      const lists = named(rules);
      expect(lists.map((list) => list.length)).toEqual([AGENT_VAULT_MAX_IDS_PER_CONDITION, 200]);
      expect(lists.flat().sort()).toEqual([...ids].sort());
    }
  });
});

describe("a role naming more ids than the API allows", () => {
  const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const naming = (count: number): TProjectPermission[] =>
    Array.from({ length: Math.ceil(count / 1000) }, (_, index) => ({
      subject: SERVICES,
      action: ["use"],
      conditions: {
        serviceId: {
          $in: Array.from({ length: Math.min(1000, count - index * 1000) }, (__, n) =>
            idOf(index * 1000 + n)
          )
        }
      }
    })) as TProjectPermission[];

  it("counts every id across the rules", () => {
    expect(countAgentVaultRuleIds(naming(2500))).toBe(2500);
    expect(
      countAgentVaultRuleIds([
        {
          subject: SERVICES,
          action: ["use"],
          conditions: { serviceId: idOf(1) }
        } as TProjectPermission
      ])
    ).toBe(1);
  });

  it("opens as JSON only instead of drawing a row per id", () => {
    const { unsupported } = rulesToPolicy(naming(AGENT_VAULT_MAX_ROLE_IDS + 1));
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0].reason).toMatch(/at most 2000/);
    expect(rulesToPolicy(naming(AGENT_VAULT_MAX_ROLE_IDS)).unsupported).toEqual([]);
  });

  it("is refused in the JSON tab", () => {
    const result = parseRulesJson(JSON.stringify(naming(AGENT_VAULT_MAX_ROLE_IDS + 1)));
    expect("error" in result && result.error).toMatch(/at most 2000/);
  });
});
