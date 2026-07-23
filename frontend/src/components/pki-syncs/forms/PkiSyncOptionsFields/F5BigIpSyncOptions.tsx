import { PreserveItemOnRenewalField } from "./PreserveItemOnRenewalField";

export const F5BigIpSyncOptions = () => (
  <PreserveItemOnRenewalField
    label="Preserve Certificate on Renewal"
    description="Applies to certificate renewals only. When enabled, the renewed certificate replaces the existing one under the same name, so any profile that uses it keeps working. When disabled, it is uploaded with a new name and the original stays on the BIG-IP."
  />
);
