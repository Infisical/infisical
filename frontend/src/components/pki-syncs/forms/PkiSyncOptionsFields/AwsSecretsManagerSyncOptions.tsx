import { SyncSwitchField } from "./SyncSwitchField";

export const AwsSecretsManagerSyncOptions = () => (
  <SyncSwitchField
    name="syncOptions.preserveSecretOnRenewal"
    id="preserve-secret-on-renewal"
    label="Preserve Secret on Renewal"
    description="Applies to certificate renewals only. When enabled, the renewed certificate updates the existing secret, keeping the same name and ARN so consumers need no updates. When disabled, a new secret is created and the old one is removed."
    defaultChecked
  />
);
