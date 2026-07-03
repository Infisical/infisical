import { useEffect, useState } from "react";
import { Controller, useFormContext, useFormState } from "react-hook-form";
import { ArrowRight } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  Switch
} from "@app/components/v3";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";

import { TSecretSyncForm } from "../schemas";

const SAMPLE_SECRET_KEY = "API_KEY";
const SAMPLE_ENVIRONMENT = "prod";

const applyKeySchema = (schema: string | undefined) => {
  if (!schema) return SAMPLE_SECRET_KEY;
  return schema
    .replaceAll("{{secretKey}}", SAMPLE_SECRET_KEY)
    .replaceAll("{{environment}}", SAMPLE_ENVIRONMENT);
};

type PreviewProps = {
  schema: string | undefined;
  destinationName: string;
};

const KeySchemaPreview = ({ schema, destinationName }: PreviewProps) => {
  const transformed = applyKeySchema(schema);

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3" aria-hidden="true">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[10px] font-medium tracking-wider text-muted uppercase">Infisical</p>
        <div className="flex items-center justify-between gap-2 rounded border border-border bg-container px-2 py-1 text-[10px]">
          <span className="truncate font-mono text-foreground/80">{SAMPLE_SECRET_KEY}</span>
        </div>
      </div>
      <div className="flex items-center pb-1.5">
        <ArrowRight className="size-3 text-muted" strokeWidth={2.5} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-[10px] font-medium tracking-wider text-muted uppercase">
          {destinationName}
        </p>
        <div className="flex items-center justify-between gap-2 rounded border border-border bg-container px-2 py-1 text-[10px]">
          <span className="truncate font-mono text-foreground/80">
            {transformed || SAMPLE_SECRET_KEY}
          </span>
        </div>
      </div>
    </div>
  );
};

export const SecretSyncKeySchemaField = () => {
  const { control, watch, setValue } = useFormContext<TSecretSyncForm>();
  const destination = watch("destination");
  const destinationName = SECRET_SYNC_MAP[destination].name;
  const currentValue = watch("syncOptions.keySchema");

  const { errors, submitCount } = useFormState({ control });
  const hasSchemaError = Boolean(
    (errors.syncOptions as { keySchema?: unknown } | undefined)?.keySchema
  );

  const [isEnabled, setIsEnabled] = useState<boolean>(Boolean(currentValue) || hasSchemaError);

  useEffect(() => {
    if (hasSchemaError) setIsEnabled(true);
  }, [hasSchemaError, submitCount]);

  return (
    <div className="mb-4">
      <Field orientation="horizontal">
        <FieldContent>
          <Label htmlFor="customize-key-names">Customize key names</Label>
          <FieldDescription>
            Add a prefix or suffix so Infisical can identify which keys in {destinationName} it
            manages. Anything else is left untouched.
          </FieldDescription>
        </FieldContent>
        <Switch
          id="customize-key-names"
          variant="project"
          checked={isEnabled}
          onCheckedChange={(checked) => {
            setIsEnabled(checked);
            if (!checked) {
              setValue("syncOptions.keySchema", undefined, { shouldValidate: true });
            }
          }}
        />
      </Field>
      {isEnabled && (
        <Controller
          control={control}
          name="syncOptions.keySchema"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mt-4">
              <FieldLabel htmlFor="sync-key-schema">Key schema</FieldLabel>
              <Input
                id="sync-key-schema"
                value={value ?? ""}
                onChange={onChange}
                placeholder="INFISICAL_{{secretKey}}"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
              {!error && (
                <FieldDescription>
                  Provide a template to rewrite each key — use{" "}
                  <code className="rounded bg-mineshaft-800/80 px-1 py-0.5 font-mono text-[11px] text-foreground/80">
                    {"{{secretKey}}"}
                  </code>{" "}
                  as a placeholder, and optionally include{" "}
                  <code className="rounded bg-mineshaft-800/80 px-1 py-0.5 font-mono text-[11px] text-foreground/80">
                    {"{{environment}}"}
                  </code>
                  .{" "}
                  <a
                    href="https://infisical.com/docs/integrations/secret-syncs/overview#key-schemas"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Learn more
                  </a>
                  .
                </FieldDescription>
              )}
              <KeySchemaPreview schema={value} destinationName={destinationName} />
            </Field>
          )}
        />
      )}
    </div>
  );
};
