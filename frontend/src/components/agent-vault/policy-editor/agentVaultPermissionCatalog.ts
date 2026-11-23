import {
  ProjectPermissionActions,
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultServiceActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionAppConnectionActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

export type TActionSets = { allow: string[]; deny: string[] };
export type TResourceItem = TActionSets & { id: string };
export type TResourcePermissions = TActionSets & { items: TResourceItem[] };

export type TResourceRowKey = "accessBundles" | "services" | "skills";
export type TCapabilityRowKey =
  | "sessions"
  | "inlineServices"
  | "inlineSkills"
  | "delegations"
  | "variables"
  | "proxies"
  | "hooks"
  | "members"
  | "roles"
  | "appConnections"
  | "sessionLogSettings"
  | "auditLogs"
  | "project";
export type TPermissionRowKey = TResourceRowKey | TCapabilityRowKey;

export type TAgentVaultPolicy = Record<TResourceRowKey, TResourcePermissions> &
  Record<TCapabilityRowKey, TActionSets> & {
    // Rules for the actions the editor never shows (each subject's `ignored`), kept as read so a save writes them back
    // unchanged. A deny there can still matter: the backend widens one on assign-additional-privileges to a deny on
    // grant-privileges, and the workflow integration delete route checks settings delete.
    hidden?: { subject: ProjectPermissionSub; action: string[]; inverted?: boolean }[];
  };

export type TPermissionScope = { rowKey: TPermissionRowKey; itemId?: string };

export type TPermissionAction = {
  key: string;
  subject: ProjectPermissionSub;
  action: string;
  label: string;
  description: string;
  group?: string;
  // Holds for every bundle, service or skill at once, so it has no place in the scope of a single one.
  isAllOnly?: boolean;
};

export type TPermissionLevel = {
  value: string;
  label: string;
  summary: string;
  allow: string[];
};

export type TPermissionRow = {
  key: TPermissionRowKey;
  label: string;
  description: string;
  actions: TPermissionAction[];
  levels: TPermissionLevel[];
  risk?: { actions: string[]; message: string };
};

export const CUSTOM_LEVEL = "custom";
export const DENIED_LEVEL = "denied";
export const NONE_LEVEL = "none";

const Sub = ProjectPermissionSub;
// Access bundles and skills take the same action names as services.
const ResourceAction = ProjectPermissionAgentVaultServiceActions;
const SessionAction = ProjectPermissionAgentVaultSessionActions;
const BundleAction = ProjectPermissionAgentVaultAccessBundleActions;
const VariableAction = ProjectPermissionAgentVaultVariableActions;
const ProxyAction = ProjectPermissionAgentVaultProxyActions;
const HookAction = ProjectPermissionAgentVaultHookActions;
const ConnectionAction = ProjectPermissionAppConnectionActions;
const MemberAction = ProjectPermissionMemberActions;
const GroupAction = ProjectPermissionGroupActions;
const IdentityAction = ProjectPermissionIdentityActions;
const GeneralAction = ProjectPermissionActions;
const AuditAction = ProjectPermissionAuditLogsActions;

export type TSubjectRules = {
  readAction?: string;
  requires?: Record<string, string[]>;
  ignored?: string[];
  legacy?: { action: string; replacedBy: string[] };
  idField?: string;
};

// What holds for a subject whichever row shows its actions. The ignored actions are ones a role can carry but nothing in
// Agent Vault offers: session log settings can only be read and changed, and Agent Vault refuses to assume another
// member's privileges. They are never shown, and a save writes back whatever a role held of them, so a copy of admin
// stays editable.
export const SUBJECT_RULES: Partial<Record<ProjectPermissionSub, TSubjectRules>> = {
  [Sub.AgentVaultAccessBundles]: { readAction: BundleAction.Read, idField: "accessBundleId" },
  [Sub.AgentVaultServices]: { readAction: ResourceAction.Read, idField: "serviceId" },
  [Sub.AgentVaultSkills]: { readAction: ResourceAction.Read, idField: "skillId" },
  [Sub.AgentVaultSessions]: {
    readAction: SessionAction.Read,
    requires: {
      [SessionAction.ReadAny]: [SessionAction.Read],
      [SessionAction.EditAny]: [SessionAction.Edit, SessionAction.ReadAny],
      [SessionAction.RevokeAny]: [SessionAction.Revoke, SessionAction.ReadAny],
      [SessionAction.CreateWithInlineServices]: [SessionAction.Create],
      [SessionAction.CreateWithInlineSkills]: [SessionAction.Create]
    }
  },
  [Sub.AgentVaultVariables]: { readAction: VariableAction.Read },
  [Sub.AgentVaultProxies]: { readAction: ProxyAction.Read },
  [Sub.AgentVaultHooks]: { readAction: HookAction.Read },
  // Agent Vault gives access through roles alone, so nothing there checks additional privileges.
  [Sub.Member]: {
    readAction: MemberAction.Read,
    ignored: [MemberAction.AssignAdditionalPrivileges, MemberAction.AssumePrivileges],
    legacy: { action: MemberAction.GrantPrivileges, replacedBy: [MemberAction.AssignRole] }
  },
  [Sub.Groups]: {
    readAction: GroupAction.Read,
    legacy: { action: GroupAction.GrantPrivileges, replacedBy: [GroupAction.AssignRole] }
  },
  [Sub.Identity]: {
    readAction: IdentityAction.Read,
    ignored: [IdentityAction.AssignAdditionalPrivileges, IdentityAction.AssumePrivileges],
    legacy: { action: IdentityAction.GrantPrivileges, replacedBy: [IdentityAction.AssignRole] }
  },
  [Sub.Role]: { readAction: GeneralAction.Read },
  [Sub.AppConnections]: { readAction: ConnectionAction.Read },
  [Sub.Settings]: {
    readAction: GeneralAction.Read,
    ignored: [GeneralAction.Create, GeneralAction.Delete]
  },
  [Sub.AuditLogs]: { readAction: AuditAction.Read },
  [Sub.Project]: {}
};

const RESOURCE_COPY = {
  accessBundles: {
    read: "See the bundle and the services and skills in it.",
    use: "Start sessions from the bundle, with every service and skill in it.",
    edit: "Rename the bundle and change which services and skills are in it. Adding one also takes Use on it.",
    delete: "Delete the bundle. Its services and skills stay in the project.",
    create: "Add new access bundles to the project."
  },
  services: {
    read: "See the service and its settings.",
    use: "Put the service in a session so agents can reach it.",
    edit: "Change the service. Pointing it somewhere else, or weakening its TLS, takes entering its credential again.",
    delete: "Delete the service from the project.",
    create: "Add new services to the project."
  },
  skills: {
    read: "See the skill and its files.",
    use: "Put the skill in a session so agents can load it.",
    edit: "Change the skill's files, which every session that loads it runs.",
    delete: "Delete the skill from the project.",
    create: "Add new skills to the project."
  }
};

const resourceActions = (
  subject: ProjectPermissionSub,
  copy: (typeof RESOURCE_COPY)[TResourceRowKey]
): TPermissionAction[] => [
  {
    key: ResourceAction.Read,
    subject,
    action: ResourceAction.Read,
    label: "View",
    description: copy.read
  },
  {
    key: ResourceAction.Use,
    subject,
    action: ResourceAction.Use,
    label: "Use",
    description: copy.use
  },
  {
    key: ResourceAction.Edit,
    subject,
    action: ResourceAction.Edit,
    label: "Edit",
    description: copy.edit
  },
  {
    key: ResourceAction.Delete,
    subject,
    action: ResourceAction.Delete,
    label: "Delete",
    description: copy.delete
  },
  {
    key: ResourceAction.Create,
    subject,
    action: ResourceAction.Create,
    label: "Create",
    description: copy.create,
    isAllOnly: true
  }
];

const RESOURCE_LEVELS: TPermissionLevel[] = [
  { value: NONE_LEVEL, label: "No Access", summary: "", allow: [] },
  { value: "view", label: "View", summary: "View", allow: [ResourceAction.Read] },
  { value: "use", label: "Use", summary: "Use", allow: [ResourceAction.Read, ResourceAction.Use] },
  {
    value: "edit",
    label: "Use and Edit",
    summary: "Use and edit",
    allow: [ResourceAction.Read, ResourceAction.Use, ResourceAction.Edit]
  },
  {
    value: "manage",
    label: "Full Control",
    summary: "Full control",
    allow: [ResourceAction.Read, ResourceAction.Use, ResourceAction.Edit, ResourceAction.Delete]
  }
];

const single = (
  subject: ProjectPermissionSub,
  action: string,
  label: string,
  description: string
): TPermissionAction => ({ key: action, subject, action, label, description });

type TDirectoryGroup = {
  prefix: string;
  group: string;
  subject: ProjectPermissionSub;
  one: string;
  many: string;
};

const USERS: TDirectoryGroup = {
  prefix: "users",
  group: "Users",
  subject: Sub.Member,
  one: "a user",
  many: "users"
};
const GROUPS: TDirectoryGroup = {
  prefix: "groups",
  group: "Groups",
  subject: Sub.Groups,
  one: "a group",
  many: "groups"
};
const IDENTITIES: TDirectoryGroup = {
  prefix: "identities",
  group: "Machine Identities",
  subject: Sub.Identity,
  one: "a machine identity",
  many: "machine identities"
};

const directoryKey = (group: TDirectoryGroup, action: string) => `${group.prefix}.${action}`;

const directoryAction = (
  group: TDirectoryGroup,
  action: string,
  label: string,
  description: string
): TPermissionAction => ({
  key: directoryKey(group, action),
  subject: group.subject,
  action,
  label,
  description,
  group: group.group
});

const directoryBasics = (group: TDirectoryGroup) => [
  directoryAction(group, MemberAction.Read, "View", `See the ${group.many} in this project.`),
  directoryAction(group, MemberAction.Create, "Add", `Add ${group.many} to this project.`),
  directoryAction(
    group,
    MemberAction.Edit,
    "Edit",
    `Change the membership ${group.one} has in this project.`
  ),
  directoryAction(group, MemberAction.Delete, "Remove", `Remove ${group.many} from this project.`),
  directoryAction(
    group,
    MemberAction.AssignRole,
    "Assign Roles",
    `Change which role ${group.one} holds.`
  )
];

const directoryLegacy = (group: TDirectoryGroup, replacedBy: string) =>
  directoryAction(
    group,
    MemberAction.GrantPrivileges,
    "Grant Privileges (Legacy)",
    `The older form of ${replacedBy}. Kept for roles that already hold it.`
  );

const DIRECTORY_ACTIONS: TPermissionAction[] = [
  ...directoryBasics(USERS),
  directoryLegacy(USERS, "Assign Roles"),
  ...directoryBasics(GROUPS),
  directoryLegacy(GROUPS, "Assign Roles"),
  ...directoryBasics(IDENTITIES),
  directoryAction(
    IDENTITIES,
    IdentityAction.GetToken,
    "View Tokens",
    "See the access tokens a machine identity holds."
  ),
  directoryAction(
    IDENTITIES,
    IdentityAction.CreateToken,
    "Create Tokens",
    "Create access tokens for a machine identity."
  ),
  directoryAction(
    IDENTITIES,
    IdentityAction.DeleteToken,
    "Delete Tokens",
    "Revoke the access tokens a machine identity holds."
  ),
  directoryAction(
    IDENTITIES,
    IdentityAction.RevokeAuth,
    "Revoke Auth",
    "Remove a sign-in method from a machine identity."
  ),
  directoryAction(
    IDENTITIES,
    IdentityAction.EditAuth,
    "Edit Auth",
    "Add or change the sign-in methods of a machine identity."
  ),
  directoryLegacy(IDENTITIES, "Assign Roles")
];

const DIRECTORY_GROUPS = [USERS, GROUPS, IDENTITIES];
const directoryKeys = (actions: string[]) =>
  DIRECTORY_GROUPS.flatMap((group) => actions.map((action) => directoryKey(group, action)));
const DIRECTORY_READ_KEYS = directoryKeys([MemberAction.Read]);
const DIRECTORY_LEGACY_KEYS = directoryKeys([MemberAction.GrantPrivileges]);

const SESSION_OWN = [
  SessionAction.Read,
  SessionAction.Create,
  SessionAction.Edit,
  SessionAction.Revoke
];

export const PERMISSION_ROWS: TPermissionRow[] = [
  {
    key: "services",
    label: "Services",
    description:
      "Use puts a service in a session. Use and Edit can also change what agents can do with its credential, such as its allowed paths and tools. Pointing it somewhere else or weakening its TLS takes entering the credential again. Denied overrides every other role, but not an access bundle that holds the service.",
    actions: resourceActions(Sub.AgentVaultServices, RESOURCE_COPY.services),
    levels: RESOURCE_LEVELS
  },
  {
    key: "skills",
    label: "Skills",
    description:
      "Use puts a skill in a session. Use and Edit can also change a skill's files, which every session that loads it runs. Denied overrides every other role, but not an access bundle that holds the skill.",
    actions: resourceActions(Sub.AgentVaultSkills, RESOURCE_COPY.skills),
    levels: RESOURCE_LEVELS
  },
  {
    key: "accessBundles",
    label: "Access Bundles",
    description:
      "Use starts sessions from a bundle with every service and skill in it, whatever Services or Skills say. Use and Edit can also change what a bundle holds, and adding a service or skill takes Use on it under Services or Skills. Denied overrides every other role.",
    actions: resourceActions(Sub.AgentVaultAccessBundles, RESOURCE_COPY.accessBundles),
    levels: RESOURCE_LEVELS
  },
  {
    key: "sessions",
    label: "Sessions",
    description: "Start sessions, and see, rename and end them: their own, or everyone's.",
    actions: [
      single(
        Sub.AgentVaultSessions,
        SessionAction.Read,
        "View Own",
        "See the sessions they started. A session only works while its owner can."
      ),
      single(
        Sub.AgentVaultSessions,
        SessionAction.Create,
        "Start",
        "Start sessions with the services and skills they can use."
      ),
      single(
        Sub.AgentVaultSessions,
        SessionAction.Edit,
        "Edit Own",
        "Rename the sessions they started."
      ),
      single(
        Sub.AgentVaultSessions,
        SessionAction.Revoke,
        "Revoke Own",
        "End the sessions they started."
      ),
      single(
        Sub.AgentVaultSessions,
        SessionAction.ReadAny,
        "View Everyone's",
        "See every session in the project and its logs."
      ),
      single(
        Sub.AgentVaultSessions,
        SessionAction.EditAny,
        "Edit Everyone's",
        "Rename anyone's session."
      ),
      single(
        Sub.AgentVaultSessions,
        SessionAction.RevokeAny,
        "Revoke Everyone's",
        "End anyone's session."
      )
    ],
    levels: [
      { value: NONE_LEVEL, label: "No Access", summary: "", allow: [] },
      { value: "own", label: "Own Sessions", summary: "Own sessions", allow: SESSION_OWN },
      {
        value: "see-all",
        label: "See Everyone's",
        summary: "Own sessions, and view everyone's",
        allow: [...SESSION_OWN, SessionAction.ReadAny]
      },
      {
        value: "manage-all",
        label: "Manage Everyone's",
        summary: "Own sessions, and view, rename and end everyone's",
        allow: [
          ...SESSION_OWN,
          SessionAction.ReadAny,
          SessionAction.EditAny,
          SessionAction.RevokeAny
        ]
      }
    ],
    risk: {
      actions: [SessionAction.EditAny, SessionAction.RevokeAny],
      message: "Can rename or end anyone's session, which stops agents other people run."
    }
  },
  {
    key: "inlineServices",
    label: "Inline Services",
    description:
      "Start sessions with services defined on the spot, with their own hosts and credentials.",
    actions: [
      single(
        Sub.AgentVaultSessions,
        SessionAction.CreateWithInlineServices,
        "Start With Inline Services",
        "Start sessions that bring their own services, with their own hosts and credentials."
      )
    ],
    levels: [
      { value: NONE_LEVEL, label: "No", summary: "", allow: [] },
      {
        value: "yes",
        label: "Yes",
        summary: "Sessions can bring their own services",
        allow: [SessionAction.CreateWithInlineServices]
      }
    ],
    risk: {
      actions: [SessionAction.CreateWithInlineServices],
      message:
        "Whoever starts the session decides which hosts it reaches and which credentials it sends, so a proxy's Service Hosts traffic policy no longer limits it."
    }
  },
  {
    key: "inlineSkills",
    label: "Inline Skills",
    description:
      "Start sessions with skills sent along with them, which hold instructions but no credentials.",
    actions: [
      single(
        Sub.AgentVaultSessions,
        SessionAction.CreateWithInlineSkills,
        "Start With Inline Skills",
        "Start sessions that bring their own skills."
      )
    ],
    levels: [
      { value: NONE_LEVEL, label: "No", summary: "", allow: [] },
      {
        value: "yes",
        label: "Yes",
        summary: "Sessions can bring their own skills",
        allow: [SessionAction.CreateWithInlineSkills]
      }
    ]
  },
  {
    key: "delegations",
    label: "Sessions on Behalf of Users",
    description: "Choose which users a machine identity can start sessions on behalf of.",
    actions: [
      single(
        Sub.AgentVaultSessions,
        SessionAction.ManageDelegations,
        "Manage Delegations",
        "Set which users a machine identity can start sessions on behalf of. Also takes editing that machine identity."
      )
    ],
    levels: [
      { value: NONE_LEVEL, label: "No", summary: "", allow: [] },
      {
        value: "yes",
        label: "Yes",
        summary: "Can let machine identities act for users",
        allow: [SessionAction.ManageDelegations]
      }
    ],
    risk: {
      actions: [SessionAction.ManageDelegations],
      message:
        "A session on a user's behalf sends that user's personal values, so whoever sets this decides who can act with them."
    }
  },
  {
    key: "variables",
    label: "Global Variables",
    description: "Shared values that services reference as {{KEY}}, such as tokens.",
    actions: [
      single(
        Sub.AgentVaultVariables,
        VariableAction.Read,
        "View Names",
        "See which global variables exist and which services use them."
      ),
      single(
        Sub.AgentVaultVariables,
        VariableAction.ReadValue,
        "View Values",
        "Read the value of any global variable."
      ),
      single(Sub.AgentVaultVariables, VariableAction.Create, "Create", "Add global variables."),
      single(
        Sub.AgentVaultVariables,
        VariableAction.Edit,
        "Edit",
        "Change the value of a global variable."
      ),
      single(Sub.AgentVaultVariables, VariableAction.Delete, "Delete", "Delete global variables.")
    ],
    levels: [
      { value: NONE_LEVEL, label: "No Access", summary: "", allow: [] },
      {
        value: "view-names",
        label: "View Names",
        summary: "Names only",
        allow: [VariableAction.Read]
      },
      {
        value: "view-values",
        label: "View Values",
        summary: "Names and values",
        allow: [VariableAction.Read, VariableAction.ReadValue]
      },
      {
        value: "full",
        label: "Full Control",
        summary: "Names and values, and create, edit and delete",
        allow: [
          VariableAction.Read,
          VariableAction.ReadValue,
          VariableAction.Create,
          VariableAction.Edit,
          VariableAction.Delete
        ]
      }
    ],
    risk: {
      actions: [VariableAction.ReadValue],
      message: "Can read every global variable's value, and variables often hold credentials."
    }
  },
  {
    key: "proxies",
    label: "Proxies",
    description:
      "The proxies that attach credentials to what agents send. Managing them includes issuing and revoking proxy tokens.",
    actions: [
      single(
        Sub.AgentVaultProxies,
        ProxyAction.Read,
        "View",
        "See the project's proxies and whether they are connected."
      ),
      single(Sub.AgentVaultProxies, ProxyAction.Create, "Create", "Add proxies."),
      single(
        Sub.AgentVaultProxies,
        ProxyAction.Edit,
        "Edit",
        "Change a proxy's settings, such as its traffic policy."
      ),
      single(Sub.AgentVaultProxies, ProxyAction.Delete, "Delete", "Delete proxies."),
      single(
        Sub.AgentVaultProxies,
        ProxyAction.IssueToken,
        "Issue Tokens",
        "Create the token a proxy process signs in with."
      ),
      single(Sub.AgentVaultProxies, ProxyAction.Revoke, "Revoke Tokens", "Revoke a proxy's tokens.")
    ],
    levels: [
      { value: NONE_LEVEL, label: "No Access", summary: "", allow: [] },
      { value: "view", label: "View", summary: "View", allow: [ProxyAction.Read] },
      {
        value: "manage",
        label: "Manage",
        summary: "View, create, edit and delete, and issue and revoke tokens",
        allow: [
          ProxyAction.Read,
          ProxyAction.Create,
          ProxyAction.Edit,
          ProxyAction.Delete,
          ProxyAction.IssueToken,
          ProxyAction.Revoke
        ]
      }
    ]
  },
  {
    key: "hooks",
    label: "Hooks",
    description:
      "Saved hooks: servers of yours that the proxy asks before it lets a request or connection through. Picking a hook on a service also takes editing that service.",
    actions: [
      single(
        Sub.AgentVaultHooks,
        HookAction.Read,
        "View",
        "See the project's hooks and pick one on a service."
      ),
      single(Sub.AgentVaultHooks, HookAction.Create, "Create", "Add hooks."),
      single(Sub.AgentVaultHooks, HookAction.Edit, "Edit", "Change a hook's name, URL or secret."),
      single(
        Sub.AgentVaultHooks,
        HookAction.Delete,
        "Delete",
        "Delete hooks, which takes them off every service."
      )
    ],
    levels: [
      { value: NONE_LEVEL, label: "No Access", summary: "", allow: [] },
      { value: "view", label: "View", summary: "View", allow: [HookAction.Read] },
      {
        value: "manage",
        label: "Manage",
        summary: "View, create, edit and delete",
        allow: [HookAction.Read, HookAction.Create, HookAction.Edit, HookAction.Delete]
      }
    ],
    risk: {
      actions: [HookAction.Edit],
      message:
        "Can point a hook at another server, which then sees the requests of every service that uses it."
    }
  },
  {
    key: "members",
    label: "Members and Groups",
    description: "The users, groups and machine identities in this project, and their roles.",
    actions: DIRECTORY_ACTIONS,
    levels: [
      { value: NONE_LEVEL, label: "No Access", summary: "", allow: [] },
      {
        value: "view",
        label: "View",
        summary: "View users, groups and machine identities",
        allow: DIRECTORY_READ_KEYS
      },
      {
        value: "manage",
        label: "Add and Remove",
        summary: "View, add, edit and remove users, groups and machine identities",
        allow: directoryKeys([
          MemberAction.Read,
          MemberAction.Create,
          MemberAction.Edit,
          MemberAction.Delete
        ])
      },
      {
        value: "full",
        label: "Manage and Assign Roles",
        summary:
          "Everything, including assigning roles and managing machine identities' tokens and sign-in methods",
        // The API refuses the legacy action next to the ones that replaced it, so everything leaves it out.
        allow: DIRECTORY_ACTIONS.map(({ key }) => key).filter(
          (key) => !DIRECTORY_LEGACY_KEYS.includes(key)
        )
      }
    ],
    risk: {
      actions: DIRECTORY_ACTIONS.map(({ key }) => key).filter(
        (key) => !DIRECTORY_READ_KEYS.includes(key)
      ),
      message:
        "Can add anyone to this project and give them any role except Admin, which only an admin can give. Tokens and sign-in methods of a machine identity that holds Admin stay with admins too."
    }
  },
  {
    key: "roles",
    label: "Roles",
    description: "The roles in this project and what each one grants.",
    actions: [
      single(
        Sub.Role,
        GeneralAction.Read,
        "View",
        "See the project's roles and what each one grants."
      ),
      single(Sub.Role, GeneralAction.Create, "Create", "Add roles."),
      single(Sub.Role, GeneralAction.Edit, "Edit", "Change a role's name and what it grants."),
      single(Sub.Role, GeneralAction.Delete, "Delete", "Delete roles that nobody holds.")
    ],
    levels: [
      { value: NONE_LEVEL, label: "No Access", summary: "", allow: [] },
      { value: "view", label: "View", summary: "View", allow: [GeneralAction.Read] },
      {
        value: "manage",
        label: "Manage",
        summary: "View, create, edit and delete",
        allow: [GeneralAction.Read, GeneralAction.Create, GeneralAction.Edit, GeneralAction.Delete]
      }
    ],
    risk: {
      actions: [GeneralAction.Create, GeneralAction.Edit, GeneralAction.Delete],
      message:
        "Can change what any role grants, including their own, and so give themselves more access."
    }
  },
  {
    key: "appConnections",
    label: "App Connections",
    description: "Connections to other systems. Agent Vault uses one to store session logs.",
    actions: [
      single(
        Sub.AppConnections,
        ConnectionAction.Read,
        "View",
        "See the project's app connections."
      ),
      single(Sub.AppConnections, ConnectionAction.Create, "Create", "Add app connections."),
      single(
        Sub.AppConnections,
        ConnectionAction.Edit,
        "Edit",
        "Change an app connection's credentials and settings."
      ),
      single(Sub.AppConnections, ConnectionAction.Delete, "Delete", "Delete app connections."),
      single(
        Sub.AppConnections,
        ConnectionAction.Connect,
        "Connect",
        "Use an app connection, such as the one that stores session logs."
      )
    ],
    levels: [
      { value: NONE_LEVEL, label: "No Access", summary: "", allow: [] },
      { value: "view", label: "View", summary: "View", allow: [ConnectionAction.Read] },
      {
        value: "use",
        label: "Use",
        summary: "View and connect",
        allow: [ConnectionAction.Read, ConnectionAction.Connect]
      },
      {
        value: "manage",
        label: "Manage",
        summary: "View, create, edit, delete and connect",
        allow: [
          ConnectionAction.Read,
          ConnectionAction.Create,
          ConnectionAction.Edit,
          ConnectionAction.Delete,
          ConnectionAction.Connect
        ]
      }
    ]
  },
  {
    key: "sessionLogSettings",
    label: "Session Log Settings",
    description: "Where session logs are stored and who is told about problems with them.",
    actions: [
      single(Sub.Settings, GeneralAction.Read, "View", "See where session logs are stored."),
      single(
        Sub.Settings,
        GeneralAction.Edit,
        "Change",
        "Change where session logs are stored and who is told about problems."
      )
    ],
    levels: [
      { value: NONE_LEVEL, label: "No Access", summary: "", allow: [] },
      { value: "view", label: "View", summary: "View", allow: [GeneralAction.Read] },
      {
        value: "manage",
        label: "Manage",
        summary: "View and change",
        allow: [GeneralAction.Read, GeneralAction.Edit]
      }
    ]
  },
  {
    key: "auditLogs",
    label: "Audit Logs",
    description: "The record of who changed what in this project.",
    actions: [
      single(
        Sub.AuditLogs,
        AuditAction.Read,
        "View",
        "Read the record of who did what in this project."
      ),
      single(
        Sub.AuditLogs,
        AuditAction.Edit,
        "Change Settings",
        "Change audit log settings, such as how long logs are kept."
      )
    ],
    levels: [
      { value: NONE_LEVEL, label: "No Access", summary: "", allow: [] },
      { value: "view", label: "View", summary: "View", allow: [AuditAction.Read] },
      {
        value: "manage",
        label: "Manage",
        summary: "View, and change audit log settings",
        allow: [AuditAction.Read, AuditAction.Edit]
      }
    ]
  },
  {
    key: "project",
    label: "Project",
    description: "The project's own name and settings.",
    actions: [
      single(
        Sub.Project,
        GeneralAction.Edit,
        "Edit Settings",
        "Change the project's name and settings."
      ),
      single(
        Sub.Project,
        GeneralAction.Delete,
        "Delete",
        "Delete the project and everything in it."
      )
    ],
    levels: [
      { value: NONE_LEVEL, label: "No Access", summary: "", allow: [] },
      {
        value: "edit",
        label: "Edit Settings",
        summary: "Edit settings",
        allow: [GeneralAction.Edit]
      },
      {
        value: "edit-delete",
        label: "Edit and Delete",
        summary: "Edit settings and delete the project",
        allow: [GeneralAction.Edit, GeneralAction.Delete]
      }
    ],
    risk: {
      actions: [GeneralAction.Delete],
      message: "Can delete this project and everything in it."
    }
  }
];

export const RESOURCE_NOUNS: Record<
  TResourceRowKey,
  { label: string; singular: string; plural: string }
> = {
  accessBundles: { label: "Access Bundles", singular: "access bundle", plural: "access bundles" },
  services: { label: "Services", singular: "service", plural: "services" },
  skills: { label: "Skills", singular: "skill", plural: "skills" }
};
