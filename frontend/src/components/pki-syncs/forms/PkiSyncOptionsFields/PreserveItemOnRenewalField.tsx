import { ReactNode } from "react";

import { SyncSwitchField } from "./SyncSwitchField";

type Props = {
  label: string;
  description: ReactNode;
};

export const PreserveItemOnRenewalField = ({ label, description }: Props) => (
  <SyncSwitchField
    name="syncOptions.preserveItemOnRenewal"
    id="preserve-item-on-renewal"
    label={label}
    description={description}
    defaultChecked
  />
);
