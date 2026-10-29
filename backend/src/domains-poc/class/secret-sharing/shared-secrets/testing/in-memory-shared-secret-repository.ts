import { SharedSecret, TSharedSecretProps } from "../model/shared-secret";
import { TSharedSecretRepository } from "../repository/shared-secret-repository";

export class InMemorySharedSecretRepository implements TSharedSecretRepository {
  readonly rows = new Map<string, TSharedSecretProps>();

  async findById(sharedSecretId: string) {
    const props = this.rows.get(sharedSecretId);
    return props ? SharedSecret.restore({ ...props }) : undefined;
  }

  async findByIdForUpdate(sharedSecretId: string) {
    return this.findById(sharedSecretId);
  }

  async create(sharedSecret: SharedSecret) {
    this.rows.set(sharedSecret.id, sharedSecret.toProps());
  }

  async update(sharedSecret: SharedSecret) {
    this.rows.set(sharedSecret.id, sharedSecret.toProps());
  }

  async delete(sharedSecretId: string) {
    this.rows.delete(sharedSecretId);
  }
}
