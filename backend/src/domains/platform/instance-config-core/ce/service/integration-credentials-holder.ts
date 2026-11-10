import { TIntegrationCredentials } from "./instance-config-types";

// This process's decrypted app credentials and the updatedAt of the row they came from, so a read decrypts again
// only after the row changed.
export class IntegrationCredentialsHolder {
  private held: { credentials: TIntegrationCredentials; updatedAt: Date } | null = null;

  get(updatedAt: Date): TIntegrationCredentials | null {
    return this.held && this.held.updatedAt.getTime() === updatedAt.getTime() ? this.held.credentials : null;
  }

  set(credentials: TIntegrationCredentials, updatedAt: Date) {
    this.held = { credentials, updatedAt };
  }
}
