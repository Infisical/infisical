import { Fragment } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faPlus, faQuestionCircle, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  FilterableSelect,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Switch,
  Tooltip
} from "@app/components/v2";
import {
  TAwsConnectionKmsKey,
  useListAwsConnectionKmsKeys
} from "@app/hooks/api/appConnections/aws";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/hooks/api/secretSyncs/types/aws-secrets-manager-sync";

import { TSecretSyncForm } from "../schemas";

const AwsTagsSection = () => {
  const { control } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSSecretsManager }
  >();

  const tagFields = useFieldArray({
    control,
    name: "syncOptions.tags"
  });

  return (
    <div className="mb-4 mt-2 flex flex-col pl-2">
      <div className="grid max-h-[20vh] grid-cols-12 items-end gap-2 overflow-y-auto">
        {tagFields.fields.map(({ id: tagFieldId }, i) => (
          <Fragment key={tagFieldId}>
            <div className="col-span-5">
              {i === 0 && <span className="text-xs text-mineshaft-400">Key</span>}
              <Controller
                control={control}
                name={`syncOptions.tags.${i}.key`}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    className="mb-0"
                  >
                    <Input className="text-xs" {...field} />
                  </FormControl>
                )}
              />
            </div>
            <div className="col-span-6">
              {i === 0 && (
                <FormLabel label="Value" className="text-xs text-mineshaft-400" isOptional />
              )}
              <Controller
                control={control}
                name={`syncOptions.tags.${i}.value`}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    className="mb-0"
                  >
                    <Input className="text-xs" {...field} />
                  </FormControl>
                )}
              />
            </div>
            <Tooltip content="Remove tag" position="right">
              <IconButton
                variant="plain"
                ariaLabel="Remove tag"
                className="col-span-1 mb-1.5"
                colorSchema="danger"
                size="xs"
                onClick={() => tagFields.remove(i)}
              >
                <FontAwesomeIcon icon={faTrash} />
              </IconButton>
            </Tooltip>
          </Fragment>
        ))}
      </div>
      <div className="mt-2 flex">
        <Button
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          size="xs"
          variant="outline_bg"
          onClick={() => tagFields.append({ key: "", value: "" })}
        >
          Add Tag
        </Button>
      </div>
    </div>
  );
};

export const AwsSecretsManagerSyncOptionsFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSSecretsManager }
  >();

  const region = watch("destinationConfig.region");
  const connectionId = useWatch({ name: "connection.id", control });
  const mappingBehavior = watch("destinationConfig.mappingBehavior");
  const watchedTags = watch("syncOptions.tags");

  const { data: kmsKeys = [], isPending: isKmsKeysPending } = useListAwsConnectionKmsKeys(
    {
      connectionId,
      region,
      destination: SecretSync.AWSSecretsManager
    },
    { enabled: Boolean(connectionId && region) }
  );

  return (
    <>
      <Controller
        name="syncOptions.keyId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipText="The AWS KMS key to encrypt secrets with"
            isError={Boolean(error)}
            errorText={error?.message}
            label="KMS Key"
          >
            <FilterableSelect
              isLoading={isKmsKeysPending && Boolean(connectionId && region)}
              isDisabled={!connectionId}
              value={kmsKeys.find((org) => org.alias === value) ?? null}
              onChange={(option) =>
                onChange((option as SingleValue<TAwsConnectionKmsKey>)?.alias ?? null)
              }
              // eslint-disable-next-line react/no-unstable-nested-components
              noOptionsMessage={({ inputValue }) =>
                inputValue ? undefined : (
                  <p>
                    To configure a KMS key, ensure the following permissions are present on the
                    selected IAM role:{" "}
                    <span className="rounded bg-mineshaft-600 text-mineshaft-300">
                      &#34;kms:ListAliases&#34;
                    </span>
                    ,{" "}
                    <span className="rounded bg-mineshaft-600 text-mineshaft-300">
                      &#34;kms:DescribeKey&#34;
                    </span>
                    ,{" "}
                    <span className="rounded bg-mineshaft-600 text-mineshaft-300">
                      &#34;kms:Encrypt&#34;
                    </span>
                    ,{" "}
                    <span className="rounded bg-mineshaft-600 text-mineshaft-300">
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
          </FormControl>
        )}
      />

      <Switch
        className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
        id="overwrite-tags"
        thumbClassName="bg-mineshaft-800"
        isChecked={Array.isArray(watchedTags)}
        onCheckedChange={(isChecked) => {
          if (isChecked) {
            setValue("syncOptions.tags", []);
          } else {
            setValue("syncOptions.tags", undefined);
          }
        }}
      >
        <p className="w-fit">
          Configure Secret Tags{" "}
          <Tooltip
            className="max-w-md"
            content={
              <p>
                If enabled, AWS secret tags will be overwritten using static values defined below.
              </p>
            }
          >
            <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
          </Tooltip>
        </p>
      </Switch>

      {Array.isArray(watchedTags) && <AwsTagsSection />}

      {mappingBehavior === AwsSecretsManagerSyncMappingBehavior.OneToOne && (
        <Controller
          name="syncOptions.syncSecretMetadataAsTags"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error?.message)}
              errorText={error?.message}
              className="mt-4"
            >
              <Switch
                className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                id="sync-metadata-as-tags"
                thumbClassName="bg-mineshaft-800"
                isChecked={value}
                onCheckedChange={onChange}
              >
                <p className="w-[14rem]">
                  Sync Secret Metadata as Tags{" "}
                  <Tooltip
                    className="max-w-md"
                    content={
                      <>
                        <p>
                          If enabled, metadata attached to secrets will be added as tags to secrets
                          synced by Infisical.
                        </p>
                        <p className="mt-4">
                          Manually configured tags from the field above will take precedence over
                          secret metadata when tag keys conflict.
                        </p>
                      </>
                    }
                  >
                    <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                  </Tooltip>
                </p>
              </Switch>
            </FormControl>
          )}
        />
      )}
    </>
  );
};
