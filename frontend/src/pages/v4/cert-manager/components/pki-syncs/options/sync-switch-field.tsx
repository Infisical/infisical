import type { ReactNode } from "react";
import { Controller, type FieldPath } from "react-hook-form";
import { FieldError } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Switch } from "@infisical/cipher/ui/switch";

import type { TPkiSyncForm } from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";

import { type PkiSyncFieldName, usePkiSyncForm } from "../fields";

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
  const { control } = usePkiSyncForm();
  return (
    <Controller
      control={control}
      name={name as FieldPath<TPkiSyncForm>}
      render={({ field, fieldState: { error } }) => (
        <Stack gap={4}>
          <Switch
            layout="row"
            label={label}
            description={description}
            checked={(field.value as boolean | undefined) ?? defaultChecked}
            onCheckedChange={field.onChange}
          />
          <FieldError errors={[error]} />
        </Stack>
      )}
    />
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
