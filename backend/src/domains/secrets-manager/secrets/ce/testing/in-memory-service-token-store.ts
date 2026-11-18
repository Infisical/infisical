import { ServiceToken, TServiceTokenRecord } from "../models/service-token";
import { TServiceTokenStore } from "../services/dependencies";

export class InMemoryServiceTokenStore implements TServiceTokenStore {
  readonly rows = new Map<string, TServiceTokenRecord>();

  async findById(serviceTokenId: string): Promise<ServiceToken | null> {
    const row = this.rows.get(serviceTokenId);
    return row ? ServiceToken.restore(row) : null;
  }
}
