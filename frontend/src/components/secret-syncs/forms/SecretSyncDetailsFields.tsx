import { Controller, useFormContext } from "react-hook-form";
import slugify from "@sindresorhus/slugify";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { TSecretSync } from "@app/hooks/api/secretSyncs";
import { getSecretSyncDestinationColValues } from "@app/pages/secret-manager/IntegrationsListPage/components/SecretSyncsTab/SecretSyncTable/helpers";

import { getSecretSyncDestinationConfig, TSecretSyncForm } from "./schemas";

const getSuggestedSyncName = ({
  destination,
  destinationConfig,
  connection,
  environment
}: TSecretSyncForm) => {
  const parsedConfig = getSecretSyncDestinationConfig(destination, destinationConfig);
  let destinationLabel = "";
  if (parsedConfig) {
    try {
      destinationLabel = getSecretSyncDestinationColValues({
        destination,
        destinationConfig: parsedConfig,
        connection
      } as TSecretSync).primaryText;
    } catch {
      destinationLabel = "";
    }
  }

  const environmentSlug = environment?.slug
    ? slugify(environment.slug, { lowercase: true, decamelize: false })
    : "";
  const prefix = slugify(`${SECRET_SYNC_MAP[destination].name} ${destinationLabel}`, {
    lowercase: true,
    decamelize: false
  })
    .slice(0, environmentSlug ? Math.max(0, 63 - environmentSlug.length) : 64)
    .replace(/-+$/, "");

  return [prefix, environmentSlug].filter(Boolean).join("-");
};

export const SecretSyncDetailsFields = () => {
  const { control, getValues } = useFormContext<TSecretSyncForm>();
  const suggestedName = getSuggestedSyncName(getValues());

  return (
    <>
      <Controller
        control={control}
        name="name"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel htmlFor="sync-name">Name</FieldLabel>
            <Input
              id="sync-name"
              value={value ?? ""}
              onChange={onChange}
              suggestedValue={suggestedName}
              isError={Boolean(error)}
              autoFocus
              autoComplete="off"
              name="sync-name"
            />
            {!error && <FieldDescription>Must be slug-friendly.</FieldDescription>}
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel htmlFor="sync-description">
              Description <span className="text-muted">(optional)</span>
            </FieldLabel>
            <TextArea
              id="sync-description"
              value={value ?? ""}
              onChange={onChange}
              placeholder="Describe the purpose of this sync..."
              isError={Boolean(error)}
              className="resize-none"
              rows={4}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};
