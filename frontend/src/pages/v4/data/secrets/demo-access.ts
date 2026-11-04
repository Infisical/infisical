import type {
  TFolderAccess,
  TFolderAccessMembership,
  TFolderGrantType
} from "@app/hooks/api/folderAccess/types";

import type { SecretsAccessAdapter } from "./contract-access";
import { demoMutation, type DemoStore, now, useStore } from "./demo-store";

export type DemoAccessActor = {
  type: "user" | "identity";
  id: string;
  name: string;
  email?: string;
  membership: TFolderAccessMembership;
};

export type DemoFolderAccess = {
  actors: DemoAccessActor[];
  grants: (TFolderAccess & { actor: string })[];
};

const role = (name: string) => ({ id: name.toLowerCase(), slug: name.toLowerCase(), name });

export const seedFolderAccess = (): DemoFolderAccess => ({
  actors: [
    {
      type: "user",
      id: "demo-user-sarah",
      name: "Sarah Lin",
      email: "sarah@acme.dev",
      membership: { id: "membership-sarah", isProjectAdmin: true, roles: [role("Admin")] }
    },
    {
      type: "user",
      id: "demo-user-marcus",
      name: "Marcus Webb",
      email: "marcus@acme.dev",
      membership: { id: "membership-marcus", isProjectAdmin: false, roles: [role("Developer")] }
    },
    {
      type: "user",
      id: "demo-user-priya",
      name: "Priya Natarajan",
      email: "priya@acme.dev",
      membership: { id: "membership-priya", isProjectAdmin: false, roles: [role("No access")] }
    },
    {
      type: "user",
      id: "demo-user-jordan",
      name: "Jordan Lee",
      email: "jordan@acme.dev",
      membership: { id: "membership-jordan", isProjectAdmin: false, roles: [role("No access")] }
    },
    {
      type: "identity",
      id: "demo-identity-ci",
      name: "payments-ci",
      membership: { id: "membership-ci", isProjectAdmin: false, roles: [role("No access")] }
    }
  ],
  grants: []
});

const key = (type: string, id: string) => `${type}:${id}`;
const GRANTING = ["Admin", "Developer", "Viewer"];

const grantsFor = (
  state: DemoFolderAccess,
  dto: { projectId: string; environmentSlug: string; secretPath: string },
  actor: DemoAccessActor
) =>
  state.grants.find(
    (grant) =>
      grant.actor === key(actor.type, actor.id) &&
      grant.projectId === dto.projectId &&
      grant.environment === dto.environmentSlug &&
      grant.secretPath === dto.secretPath
  ) ?? null;

const split = (
  state: DemoFolderAccess,
  dto: { projectId: string; environmentSlug: string; secretPath: string; search?: string },
  type: DemoAccessActor["type"]
) => {
  const query = dto.search?.toLowerCase();
  const actors = state.actors
    .filter((actor) => actor.type === type)
    .filter((actor) => !query || `${actor.name} ${actor.email ?? ""}`.toLowerCase().includes(query))
    .map((actor) => {
      const access = grantsFor(state, dto, actor);
      const granting = actor.membership.roles.filter((entry) => GRANTING.includes(entry.name));
      const hasAccess = actor.membership.isProjectAdmin || Boolean(access) || granting.length > 0;
      return {
        actor,
        hasAccess,
        membership: hasAccess ? { ...actor.membership, roles: granting } : actor.membership,
        access
      };
    });
  return {
    with: actors.filter((entry) => entry.hasAccess),
    without: actors.filter((entry) => !entry.hasAccess),
    total: actors.length
  };
};

const toUser = (entry: ReturnType<typeof split>["with"][number]) => {
  const [firstName, ...rest] = entry.actor.name.split(" ");
  return {
    userId: entry.actor.id,
    username: entry.actor.email ?? entry.actor.name,
    email: entry.actor.email ?? null,
    firstName,
    lastName: rest.join(" ") || null,
    membership: entry.membership,
    folderRBACAccess: entry.access
  };
};

const toIdentity = (entry: ReturnType<typeof split>["with"][number]) => ({
  identityId: entry.actor.id,
  name: entry.actor.name,
  membership: entry.membership,
  folderRBACAccess: entry.access
});

const temporary = (type?: TFolderGrantType) =>
  type?.isTemporary
    ? {
        isTemporary: true,
        temporaryMode: type.temporaryMode,
        temporaryRange: type.temporaryRange,
        temporaryAccessStartTime: type.temporaryAccessStartTime,
        temporaryAccessEndTime: new Date(
          new Date(type.temporaryAccessStartTime).getTime() +
            (Number.parseInt(type.temporaryRange, 10) || 1) *
              ({ m: 60000, h: 3600000, d: 86400000 }[type.temporaryRange.slice(-1)] ?? 3600000)
        ).toISOString()
      }
    : {
        isTemporary: false,
        temporaryMode: null,
        temporaryRange: null,
        temporaryAccessStartTime: null,
        temporaryAccessEndTime: null
      };

type GrantDto = {
  projectId: string;
  environmentSlug: string;
  secretPath: string;
  permission?: TFolderAccess["permission"];
  type?: TFolderGrantType;
};

const upsert = (store: DemoStore, actor: string, dto: GrantDto) =>
  store.update((state) => {
    const existing = state.folderAccess.grants.find(
      (grant) =>
        grant.actor === actor &&
        grant.projectId === dto.projectId &&
        grant.environment === dto.environmentSlug &&
        grant.secretPath === dto.secretPath
    );
    const timestamp = now();
    const next = {
      ...(existing ?? {
        id: crypto.randomUUID(),
        actor,
        projectId: dto.projectId,
        folderId: `${dto.projectId}:${dto.environmentSlug}:${dto.secretPath}`,
        environment: dto.environmentSlug,
        secretPath: dto.secretPath,
        createdAt: timestamp
      }),
      permission: dto.permission ?? existing?.permission,
      ...(dto.type || !existing ? temporary(dto.type) : {}),
      updatedAt: timestamp
    } as DemoFolderAccess["grants"][number];
    return {
      ...state,
      folderAccess: {
        ...state.folderAccess,
        grants: [...state.folderAccess.grants.filter((grant) => grant !== existing), next]
      }
    };
  });

const remove = (store: DemoStore, actor: string, dto: GrantDto) =>
  store.update((state) => ({
    ...state,
    folderAccess: {
      ...state.folderAccess,
      grants: state.folderAccess.grants.filter(
        (grant) =>
          !(
            grant.actor === actor &&
            grant.projectId === dto.projectId &&
            grant.environment === dto.environmentSlug &&
            grant.secretPath === dto.secretPath
          )
      )
    }
  }));

export const secretsAccessDemo: SecretsAccessAdapter = {
  useFolderAccessUsers: (dto) => {
    const groups = split(useStore().use().folderAccess, dto, "user");
    return {
      data: {
        users: groups.with.map(toUser),
        usersWithoutAccess: groups.without.map(toUser),
        totalCount: groups.total
      },
      isPending: false,
      error: null
    };
  },
  useFolderAccessIdentities: (dto) => {
    const groups = split(useStore().use().folderAccess, dto, "identity");
    return {
      data: {
        identities: groups.with.map(toIdentity),
        identitiesWithoutAccess: groups.without.map(toIdentity),
        totalCount: groups.total
      },
      isPending: false,
      error: null
    };
  },
  useCreateUserFolderAccess: demoMutation((store, { userId, ...dto }) => {
    upsert(store, key("user", userId), dto);
    return {};
  }),
  useUpdateUserFolderAccess: demoMutation((store, { userId, ...dto }) => {
    upsert(store, key("user", userId), dto);
    return {};
  }),
  useDeleteUserFolderAccess: demoMutation((store, { userId, ...dto }) => {
    remove(store, key("user", userId), dto);
    return {};
  }),
  useCreateIdentityFolderAccess: demoMutation((store, { identityId, ...dto }) => {
    upsert(store, key("identity", identityId), dto);
    return {};
  }),
  useUpdateIdentityFolderAccess: demoMutation((store, { identityId, ...dto }) => {
    upsert(store, key("identity", identityId), dto);
    return {};
  }),
  useDeleteIdentityFolderAccess: demoMutation((store, { identityId, ...dto }) => {
    remove(store, key("identity", identityId), dto);
    return {};
  })
};
