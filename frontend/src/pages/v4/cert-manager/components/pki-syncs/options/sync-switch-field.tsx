import type { ReactNode } from "react";
import { FieldError } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Switch } from "@infisical/cipher/ui/switch";

import { type PkiSyncFieldName, useDraftField } from "../fields";

export function SyncSwitchField({
  name,
  label,
  description,
  defaultChecked = false
}: {
  name: PkiSyncFieldName;
  label: string;
  description?: ReactNode;
  defaultChecked?: boolean;
}) {
  const field = useDraftField<boolean | undefined>(name);
  return (
    <Stack gap={4}>
      <Switch
        layout="row"
        label={label}
        description={description}
        checked={field.value ?? defaultChecked}
        onCheckedChange={field.onChange}
      />
      <FieldError errors={[field.error ? { message: field.error } : undefined]} />
    </Stack>
  );
}

export const PreserveArnField = () => (
  <SyncSwitchField
    name="syncOptions.preserveArn"
    label="Preserve ARN on renewal"
    description="When enabled, renewals replace the existing certificate's contents while keeping the same ARN, so consumers like load balancers need no manual updates. When disabled, a new ARN is created and the old certificate is removed."
    defaultChecked
  />
);

export const PreserveItemOnRenewalField = ({
  label,
  description
}: {
  label: string;
  description: ReactNode;
}) => (
  <SyncSwitchField
    name="syncOptions.preserveItemOnRenewal"
    label={label}
    description={description}
    defaultChecked
  />
);
