import { TActorNameStore } from "../services/dependencies";

// Identity names a test sets, read the way ProjectIdentityStore reads the identities table.
export class InMemoryActorNameStore implements TActorNameStore {
  readonly identityNames = new Map<string, string>();

  async findIdentityName(identityId: string): Promise<string | null> {
    return this.identityNames.get(identityId) ?? null;
  }
}
