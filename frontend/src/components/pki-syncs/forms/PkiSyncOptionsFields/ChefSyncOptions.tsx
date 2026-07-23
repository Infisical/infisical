import { PreserveItemOnRenewalField } from "./PreserveItemOnRenewalField";

export const ChefSyncOptions = () => (
  <PreserveItemOnRenewalField
    label="Preserve Data Bag Item on Renewal"
    description="Applies to certificate renewals only. When enabled, the renewed certificate updates the existing data bag item, keeping the same name so Chef cookbooks and recipes need no updates. When disabled, a new item is created and the old one is removed."
  />
);
