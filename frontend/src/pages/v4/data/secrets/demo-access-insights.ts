import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import type { TProjectPermission } from "@app/hooks/api/roles/types";
import type { TGetSecretAccessListDTO } from "@app/hooks/api/secrets/types";

import { useDemoAccessState } from "../access/demo";
import { createFixtureStore } from "../fixture-store";
import type { SecretsAccessInsightsAdapter } from "./contract-access-insights";
import type { TSecretAccessList } from "./contract-flows";
import { useScenario } from "./demo-store";

type DemoPrivilege = {
  kind: "user" | "identity";
  key: string;
  permissions: TProjectPermission[];
};

const privileges = createFixtureStore<DemoPrivilege[]>([]);

const ALL = [
  ProjectPermissionSecretActions.DescribeSecret,
  ProjectPermissionSecretActions.ReadValue,
  ProjectPermissionSecretActions.Create,
  ProjectPermissionSecretActions.Edit,
  ProjectPermissionSecretActions.Delete
];
const READ = [
  ProjectPermissionSecretActions.DescribeSecret,
  ProjectPermissionSecretActions.ReadValue
];

const roleActions = (role: string, environment: string) => {
  const production = environment.startsWith("prod");
  if (role === "admin") return ALL;
  if (role === "member") return production ? [ProjectPermissionSecretActions.DescribeSecret] : ALL;
  if (role === "viewer") return production ? [] : READ;
  if (role === "no-access") return [];
  return production ? [] : [ProjectPermissionSecretActions.DescribeSecret];
};

const conditionMatches = (condition: unknown, actual: string) => {
  if (condition === undefined) return true;
  if (typeof condition === "string") return condition === actual;
  const { $eq, $ne, $in } = condition as { $eq?: string; $ne?: string; $in?: string[] };
  if ($eq !== undefined) return $eq === actual;
  if ($ne !== undefined) return $ne !== actual;
  if ($in) return $in.includes(actual);
  return true;
};

const privilegeActions = (
  entries: DemoPrivilege[],
  kind: DemoPrivilege["kind"],
  key: string,
  dto: TGetSecretAccessListDTO
) =>
  entries
    .filter((entry) => entry.kind === kind && entry.key === key)
    .flatMap((entry) => entry.permissions)
    .filter(
      (permission) =>
        [permission.subject].flat().includes("secrets") &&
        !permission.inverted &&
        conditionMatches(permission.conditions?.environment, dto.environment) &&
        conditionMatches(permission.conditions?.secretPath, dto.secretPath) &&
        conditionMatches(permission.conditions?.secretName, dto.secretKey)
    )
    .flatMap((permission) => [permission.action].flat() as ProjectPermissionSecretActions[]);

const unique = (actions: ProjectPermissionSecretActions[]) =>
  ALL.filter((action) => actions.includes(action));

const stressed = (environment: string): TSecretAccessList => {
  const teams = ["payments-platform", "risk-and-compliance", "customer-identity", "data-warehouse"];
  return {
    users: Array.from({ length: 28 }, (_, index) => ({
      id: `stress-user-${index}`,
      membershipId: `stress-pm-${index}`,
      name: `firstname.lastname-${index + 1}@${teams[index % teams.length]}.contractors.acme-partners.example`,
      allowedActions:
        index % 3 === 0 ? ALL : roleActions(index % 2 ? "viewer" : "member", environment)
    })),
    identities: Array.from({ length: 14 }, (_, index) => ({
      id: `stress-identity-${index}`,
      membershipId: `stress-im-${index}`,
      name: `${teams[index % teams.length]}-kubernetes-workload-identity-${environment}-cluster-${index + 1}`,
      allowedActions: index % 2 ? READ : []
    })),
    groups: Array.from({ length: 6 }, (_, index) => ({
      id: `stress-group-${index}`,
      membershipId: `stress-gm-${index}`,
      name: `${teams[index % teams.length]}-on-call-engineers-with-break-glass-access`,
      allowedActions: index % 2 ? ALL : READ,
      userIds: Array.from({ length: 5 }, (__, member) => `stress-user-${index * 4 + member}`),
      identityIds: [`stress-identity-${index}`]
    }))
  };
};

export const useDemoSecretAccessList = (dto: TGetSecretAccessListDTO) => {
  const state = useDemoAccessState();
  const granted = privileges.use();
  const scenario = useScenario();
  const memberships = state.projectMemberships.filter((entry) => entry.projectId === dto.projectId);
  const actionsOf = (roles: { role: string }[]) =>
    roles.flatMap((grant) => roleActions(grant.role, dto.environment));
  const list: TSecretAccessList = {
    users: memberships.flatMap((entry) => {
      if (entry.kind !== "user") return [];
      const person = state.users.find((user) => user.id === entry.userId);
      if (!person) return [];
      return [
        {
          id: person.id,
          membershipId: entry.id,
          name: person.username,
          allowedActions: unique([
            ...actionsOf(entry.roles),
            ...privilegeActions(granted, "user", entry.id, dto)
          ])
        }
      ];
    }),
    identities: memberships.flatMap((entry) => {
      if (entry.kind !== "identity") return [];
      const identity = state.identities.find((item) => item.id === entry.identityId);
      if (!identity) return [];
      return [
        {
          id: identity.id,
          membershipId: entry.id,
          name: identity.name,
          allowedActions: unique([
            ...actionsOf(entry.roles),
            ...privilegeActions(granted, "identity", identity.id, dto)
          ])
        }
      ];
    }),
    groups: memberships.flatMap((entry) => {
      if (entry.kind !== "group") return [];
      const group = state.groups.find((item) => item.id === entry.groupId);
      if (!group) return [];
      const members = state.groupMembers.filter((member) => member.groupId === group.id);
      return [
        {
          id: group.id,
          membershipId: entry.id,
          name: group.name,
          allowedActions: unique(actionsOf(entry.roles)),
          userIds: members.flatMap((member) => (member.userId ? [member.userId] : [])),
          identityIds: members.flatMap((member) => (member.identityId ? [member.identityId] : []))
        }
      ];
    })
  };
  if (scenario === "large") {
    const extra = stressed(dto.environment);
    list.users.push(...extra.users);
    list.identities.push(...extra.identities);
    list.groups.push(...extra.groups);
  }
  if (!dto.includeAllEntities) {
    const hasAccess = (entry: { allowedActions: unknown[] }) => entry.allowedActions.length > 0;
    list.users = list.users.filter(hasAccess);
    list.identities = list.identities.filter(hasAccess);
    list.groups = list.groups.filter(hasAccess);
  }
  return { data: list, isPending: false, error: null };
};

export const secretsAccessInsightsDemo: SecretsAccessInsightsAdapter = {
  useAvailableParentOrgUsers: (enabled) => ({
    data: enabled
      ? [
          {
            id: "parent-avery",
            username: "avery.chen@acme-holdings.example",
            email: "avery.chen@acme-holdings.example",
            firstName: "Avery",
            lastName: "Chen"
          }
        ]
      : [],
    isPending: false,
    error: null
  }),
  useCreateUserPrivilege: () => ({
    isPending: false,
    mutateAsync: async (dto) => {
      privileges.update((current) => [
        ...current,
        { kind: "user", key: dto.projectMembershipId, permissions: dto.permissions }
      ]);
      return {};
    }
  }),
  useCreateIdentityPrivilege: () => ({
    isPending: false,
    mutateAsync: async (dto) => {
      privileges.update((current) => [
        ...current,
        { kind: "identity", key: dto.identityId, permissions: dto.permissions }
      ]);
      return {};
    }
  })
};
