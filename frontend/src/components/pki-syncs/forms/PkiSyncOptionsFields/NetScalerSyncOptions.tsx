import { PreserveItemOnRenewalField } from "./PreserveItemOnRenewalField";

export const NetScalerSyncOptions = () => (
  <PreserveItemOnRenewalField
    label="Preserve Certificate on Renewal"
    description="Applies to certificate renewals only. When enabled, the renewed certificate updates the existing certkey object, keeping its name and vServer bindings. When disabled, a new certkey object is created and the old certificate remains on NetScaler."
  />
);
