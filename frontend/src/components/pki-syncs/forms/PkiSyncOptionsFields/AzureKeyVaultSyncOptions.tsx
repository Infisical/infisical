import { SyncSwitchField } from "./SyncSwitchField";

export const AzureKeyVaultSyncOptions = () => (
  <SyncSwitchField
    name="syncOptions.enableVersioning"
    id="preserve-version"
    label="Enable Versioning on Renewal"
    description="When enabled, renewals add a new version of the existing certificate in Azure Key Vault under the same name, so consumers automatically use the latest version. When disabled, a new certificate is created and the old one is removed."
    defaultChecked
  />
);
