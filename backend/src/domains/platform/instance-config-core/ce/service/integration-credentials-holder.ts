import { IntegrationCredentials } from "../model/integration-credentials";

// This process's decrypted app credentials, so a read decrypts only after the row changed.
export class IntegrationCredentialsHolder {
  private credentials: IntegrationCredentials | null = null;

  get(): IntegrationCredentials | null {
    return this.credentials;
  }

  set(credentials: IntegrationCredentials) {
    this.credentials = credentials;
  }
}
