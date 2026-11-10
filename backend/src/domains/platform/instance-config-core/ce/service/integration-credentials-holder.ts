import { TIntegrationCredentials } from "./instance-config-types";

// This process's decrypted app credentials, per integration, for the row version they came from. Each integration is
// decrypted on its first read, so a column that cannot be decrypted breaks only its own integration.
export class IntegrationCredentialsHolder {
  private updatedAt: Date | null = null;

  private held: Partial<TIntegrationCredentials> = {};

  remember<K extends keyof TIntegrationCredentials>(
    updatedAt: Date,
    integration: K,
    decrypt: () => TIntegrationCredentials[K]
  ): TIntegrationCredentials[K] {
    if (this.updatedAt?.getTime() !== updatedAt.getTime()) {
      this.updatedAt = updatedAt;
      this.held = {};
    }
    const held = this.held[integration];
    if (held) return held;

    const credentials = decrypt();
    this.held[integration] = credentials;
    return credentials;
  }
}
