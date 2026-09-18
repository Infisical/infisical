import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const DevinSyncFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.Devin }>();

  return (
    <FieldGroup>
      <SecretSyncConnectionField />
      <Controller
        name="destinationConfig.orgId"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Organization ID
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent>
                  The Devin organization ID that secrets should be synced to. You can find this in
                  your Devin organization settings.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Input {...field} placeholder="org-..." isError={Boolean(error)} />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
