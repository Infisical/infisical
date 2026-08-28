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

export const DaytonaSyncFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.Daytona }>();

  return (
    <FieldGroup>
      <SecretSyncConnectionField />
      <Controller
        name="destinationConfig.organizationName"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Organization Name
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  A label for the Daytona organization these secrets are synced to. The API key on
                  the connection above decides where secrets actually land, so this name is shown in
                  Infisical only.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Input {...field} placeholder="My Daytona Organization" isError={Boolean(error)} />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
