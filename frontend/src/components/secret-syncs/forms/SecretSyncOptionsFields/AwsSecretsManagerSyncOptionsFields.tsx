import { useEffect, useState } from "react";
import { Controller, useFieldArray, useFormContext, useFormState, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { CircleHelp, Plus, Trash2 } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  IconButton,
  Input,
  Label,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  TAwsConnectionKmsKey,
  useListAwsConnectionKmsKeys
} from "@app/hooks/api/appConnections/aws";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/hooks/api/secretSyncs/types/aws-secrets-manager-sync";

import { TSecretSyncForm } from "../schemas";

const AwsTagsEditor = () => {
  const { control } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSSecretsManager }
  >();

  const tagFields = useFieldArray({
    control,
    name: "syncOptions.tags"
  });

  const canRemove = tagFields.fields.length > 1;

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {tagFields.fields.map(({ id: tagFieldId }, i) => (
          <div key={tagFieldId} className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-5">
              {i === 0 && <p className="mb-1 text-xs text-muted">Key</p>}
              <Controller
                control={control}
                name={`syncOptions.tags.${i}.key`}
                render={({ field, fieldState: { error } }) => (
                  <Input {...field} isError={Boolean(error)} className="h-8" />
                )}
              />
            </div>
            <div className="col-span-6">
              {i === 0 && <p className="mb-1 text-xs text-muted">Value (optional)</p>}
              <Controller
                control={control}
                name={`syncOptions.tags.${i}.value`}
                render={({ field, fieldState: { error } }) => (
                  <Input {...field} isError={Boolean(error)} className="h-8" />
                )}
              />
            </div>
            <div className="col-span-1 flex justify-end">
              <IconButton
                variant="ghost-muted"
                aria-label="Remove tag"
                size="sm"
                isDisabled={!canRemove}
                onClick={() => tagFields.remove(i)}
              >
                <Trash2 />
              </IconButton>
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="xs"
        type="button"
        className="w-fit"
        onClick={() => tagFields.append({ key: "", value: "" })}
      >
        <Plus />
        Add tag
      </Button>
    </div>
  );
};

const ITEM_VALUE = "aws-secrets-manager-advanced";

export const AwsSecretsManagerSyncOptionsFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSSecretsManager }
  >();

  const region = watch("destinationConfig.region");
  const connectionId = useWatch({ name: "connection.id", control });
  const mappingBehavior = watch("destinationConfig.mappingBehavior");
  const watchedTags = watch("syncOptions.tags");
  const watchedKeyId = watch("syncOptions.keyId");
  const watchedSyncMetadataAsTags = watch("syncOptions.syncSecretMetadataAsTags");

  const isOneToOne = mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne;
  const metadataAsTagsActive = isOneToOne && Boolean(watchedSyncMetadataAsTags);

  const hasConfiguredOption =
    Boolean(watchedKeyId) || Array.isArray(watchedTags) || metadataAsTagsActive;

  const { errors, submitCount } = useFormState({ control });
  const syncOptionsErrors = errors.syncOptions as Record<string, unknown> | undefined;
  const hasAccordionError = Boolean(
    syncOptionsErrors?.keyId ||
      syncOptionsErrors?.tags ||
      syncOptionsErrors?.syncSecretMetadataAsTags
  );

  const [openItem, setOpenItem] = useState<string>(
    hasConfiguredOption || hasAccordionError ? ITEM_VALUE : ""
  );

  useEffect(() => {
    if (hasAccordionError) setOpenItem(ITEM_VALUE);
  }, [hasAccordionError, submitCount]);

  const summaryParts = [
    watchedKeyId ? "Custom KMS key" : null,
    metadataAsTagsActive ? "Sync metadata as tags" : null,
    Array.isArray(watchedTags) ? "Resource tags" : null
  ].filter(Boolean);

  const summary = summaryParts.length ? summaryParts.join(" · ") : "All defaults";

  const { data: kmsKeys = [], isPending: isKmsKeysPending } = useListAwsConnectionKmsKeys(
    {
      connectionId,
      region,
      destination: SecretSync.AWSSecretsManager
    },
    { enabled: Boolean(connectionId && region) }
  );

  return (
    <Accordion
      type="single"
      collapsible
      variant="ghost"
      value={openItem}
      onValueChange={setOpenItem}
    >
      <AccordionItem value={ITEM_VALUE}>
        <AccordionTrigger>
          <div className="flex w-0 flex-1 items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground">Advanced options</span>
            <span className="truncate text-xs text-muted">{summary}</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col">
          <Controller
            name="syncOptions.keyId"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel className="flex items-center gap-1.5">
                  KMS Key
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CircleHelp className="size-3 cursor-help text-muted" />
                    </TooltipTrigger>
                    <TooltipContent>The AWS KMS key to encrypt secrets with.</TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <FilterableSelect
                    isLoading={isKmsKeysPending && Boolean(connectionId && region)}
                    isDisabled={!connectionId}
                    value={kmsKeys.find((org) => org.alias === value) ?? null}
                    onChange={(option) =>
                      onChange((option as SingleValue<TAwsConnectionKmsKey>)?.alias ?? null)
                    }
                    isError={Boolean(error)}
                    // eslint-disable-next-line react/no-unstable-nested-components
                    noOptionsMessage={({ inputValue }) =>
                      inputValue ? undefined : (
                        <p>
                          To configure a KMS key, ensure the following permissions are present on
                          the selected IAM role:{" "}
                          <span className="rounded-sm bg-mineshaft-600 text-mineshaft-300">
                            &#34;kms:ListAliases&#34;
                          </span>
                          ,{" "}
                          <span className="rounded-sm bg-mineshaft-600 text-mineshaft-300">
                            &#34;kms:DescribeKey&#34;
                          </span>
                          ,{" "}
                          <span className="rounded-sm bg-mineshaft-600 text-mineshaft-300">
                            &#34;kms:Encrypt&#34;
                          </span>
                          ,{" "}
                          <span className="rounded-sm bg-mineshaft-600 text-mineshaft-300">
                            &#34;kms:Decrypt&#34;
                          </span>
                          .
                        </p>
                      )
                    }
                    options={kmsKeys}
                    placeholder="Leave blank to use default KMS key"
                    getOptionLabel={(option) =>
                      option.alias === "alias/aws/secretsmanager"
                        ? `${option.alias} (Default)`
                        : option.alias
                    }
                    getOptionValue={(option) => option.alias}
                  />
                </FieldContent>
                <FieldError errors={[error]} />
              </Field>
            )}
          />

          {isOneToOne && (
            <Controller
              name="syncOptions.syncSecretMetadataAsTags"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="sync-secret-metadata-tags">
                        Sync secret metadata as resource tags
                      </Label>
                      <FieldDescription>
                        Metadata attached to secrets is added as resource tags on secrets synced by
                        Infisical. Manually configured tags take precedence when keys conflict.
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id="sync-secret-metadata-tags"
                      variant="project"
                      checked={value}
                      onCheckedChange={onChange}
                    />
                  </Field>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          )}

          <Field className="mb-4">
            <Field orientation="horizontal">
              <FieldContent>
                <Label htmlFor="configure-resource-tags">Configure resource tags</Label>
                <FieldDescription>
                  Static tags applied to every synced secret. Overwrites AWS resource tags on synced
                  secrets with the values defined below.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="configure-resource-tags"
                variant="project"
                checked={Array.isArray(watchedTags)}
                onCheckedChange={(isChecked) => {
                  if (isChecked) {
                    setValue("syncOptions.tags", [{ key: "", value: "" }]);
                  } else {
                    setValue("syncOptions.tags", undefined);
                  }
                }}
              />
            </Field>
            {Array.isArray(watchedTags) && <AwsTagsEditor />}
          </Field>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
