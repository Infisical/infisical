import { PreserveItemOnRenewalField } from "./PreserveItemOnRenewalField";

export const PaloAltoNetworksSyncOptions = () => (
  <PreserveItemOnRenewalField
    label="Preserve certificate on renewal"
    description="Applies to renewals only. When on, the renewed certificate replaces the existing certificate object under the same name, so anything that references it uses the renewed certificate. When off, the sync creates a new certificate object and moves the SSL/TLS service profile to it if the sync has one. The old object is deleted when removing certificates is allowed."
  />
);
