import { TMemberNames, TMemberNameStore } from "../services/dependencies";

// Names of users that are not ghosts, and of identities.
export class InMemoryMemberNameStore implements TMemberNameStore {
  readonly users = new Map<string, { username: string; isGhost?: boolean }>();

  readonly identities = new Map<string, string>();

  async findNames({ userIds, identityIds }: { userIds: string[]; identityIds: string[] }): Promise<TMemberNames> {
    return {
      users: new Map(
        userIds.flatMap((id) => {
          const user = this.users.get(id);
          return user && !user.isGhost ? [[id, user.username] as const] : [];
        })
      ),
      identities: new Map(
        identityIds.flatMap((id) => {
          const name = this.identities.get(id);
          return name === undefined ? [] : [[id, name] as const];
        })
      )
    };
  }
}
