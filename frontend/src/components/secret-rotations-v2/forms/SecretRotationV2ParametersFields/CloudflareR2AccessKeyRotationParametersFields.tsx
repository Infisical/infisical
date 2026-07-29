import { useEffect, useMemo } from "react";
import { Control, Controller, useFormContext } from "react-hook-form";
import { MultiValue } from "react-select";

import {
  FilterableSelect,
  FormControl,
  Input,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
import { useCloudflareConnectionListR2Buckets } from "@app/hooks/api/appConnections/cloudflare";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { TSecretRotationV2Form } from "../schemas";
import {
  CLOUDFLARE_R2_ACCESS_LEVEL_MAP,
  CLOUDFLARE_R2_JURISDICTION_MAP,
  CloudflareR2AccessLevel,
  r2BucketKey,
  TCloudflareR2BucketSelection
} from "../schemas/cloudflare-r2-access-key-rotation-schema";
import { CLOUDFLARE_TOKEN_NAME_MAX_LENGTH } from "../schemas/shared";
import { CloudflareIpListInput } from "./shared";

type TCloudflareR2AccessKeyForm = TSecretRotationV2Form & {
  type: SecretRotation.CloudflareR2AccessKey;
};

enum ParameterTab {
  General = "general",
  Restrictions = "restrictions"
}

const formatBucketOptionLabel = ({ name, jurisdiction }: TCloudflareR2BucketSelection) => (
  <span>
    {name}{" "}
    <span className="text-mineshaft-400">{CLOUDFLARE_R2_JURISDICTION_MAP[jurisdiction]}</span>{" "}
  </span>
);

// react-select filters on this, so it has to cover the jurisdiction the option renders too
const getBucketSearchLabel = ({ name, jurisdiction }: TCloudflareR2BucketSelection) =>
  `${CLOUDFLARE_R2_JURISDICTION_MAP[jurisdiction]} ${name}`;

const IpListField = ({
  control,
  name,
  label,
  tooltipText
}: {
  control: Control<TCloudflareR2AccessKeyForm>;
  name: "parameters.allowedIps" | "parameters.disallowedIps";
  label: string;
  tooltipText: string;
}) => (
  <Controller
    control={control}
    name={name}
    render={({ field: { value, onChange }, fieldState: { error } }) => (
      <FormControl
        isOptional
        isError={Boolean(error)}
        errorText={error?.message}
        label={label}
        tooltipText={tooltipText}
      >
        <CloudflareIpListInput value={value} onChange={onChange} />
      </FormControl>
    )}
  />
);

export const CloudflareR2AccessKeyRotationParametersFields = () => {
  const { control, watch, setValue, getValues } = useFormContext<TCloudflareR2AccessKeyForm>();

  const connectionId = watch("connection.id");
  const selectedBuckets = watch("parameters.buckets");

  // The rotation template only seeds the secrets mapping, so pick the least-privileged access level on
  // create rather than leaving the select empty.
  useEffect(() => {
    if (!getValues("parameters.accessLevel")) {
      setValue("parameters.accessLevel", CloudflareR2AccessLevel.ObjectRead);
    }
  }, []);

  const { data: buckets, isPending: isBucketsPending } = useCloudflareConnectionListR2Buckets(
    connectionId,
    { enabled: Boolean(connectionId) }
  );

  // A bucket stored on the rotation but no longer returned by Cloudflare (renamed or deleted) is kept
  // in the options so editing the rotation cannot silently drop it from the token's policy.
  const bucketOptions = useMemo<TCloudflareR2BucketSelection[]>(() => {
    const fetched = buckets ?? [];
    const fetchedKeys = new Set(fetched.map(r2BucketKey));

    const orphans = (selectedBuckets ?? []).filter(
      (selection) => !fetchedKeys.has(r2BucketKey(selection))
    );

    return [...fetched, ...orphans];
  }, [buckets, selectedBuckets]);

  return (
    <Tabs defaultValue={ParameterTab.General}>
      <TabList>
        <Tab value={ParameterTab.General}>General</Tab>
        <Tab value={ParameterTab.Restrictions}>Restrictions</Tab>
      </TabList>
      <TabPanel value={ParameterTab.General}>
        <Controller
          control={control}
          name="parameters.name"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error?.message)}
              errorText={error?.message}
              label="Token Name"
              tooltipText="The name for the generated Cloudflare API token that backs the access key. A timestamp is appended so each rotated key is distinct."
            >
              <Input
                {...field}
                placeholder="infisical-r2-access-key"
                maxLength={CLOUDFLARE_TOKEN_NAME_MAX_LENGTH}
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="parameters.buckets"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error?.message)}
              errorText={error?.message}
              label="Buckets"
              tooltipText="The R2 buckets the generated access key can act on. Buckets are granted by name, so renaming one in Cloudflare requires updating this rotation."
            >
              <FilterableSelect
                isMulti
                isLoading={isBucketsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                options={bucketOptions}
                placeholder="Select buckets..."
                formatOptionLabel={formatBucketOptionLabel}
                getOptionLabel={getBucketSearchLabel}
                getOptionValue={r2BucketKey}
                value={
                  value
                    ? bucketOptions.filter((bucket) =>
                        value.some((selection) => r2BucketKey(selection) === r2BucketKey(bucket))
                      )
                    : []
                }
                // narrowed to the two identifying fields so listing-only metadata is never persisted
                onChange={(option) =>
                  onChange(
                    (option as MultiValue<TCloudflareR2BucketSelection>).map(
                      ({ name, jurisdiction }) => ({ name, jurisdiction })
                    )
                  )
                }
              />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="parameters.accessLevel"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error?.message)}
              errorText={error?.message}
              label="Access Level"
              tooltipText="What the generated key can do on the selected buckets. Read only allows get and list; Read & Write also allows put and delete."
            >
              <Select
                className="w-full"
                position="popper"
                value={field.value}
                onValueChange={field.onChange}
              >
                {Object.entries(CLOUDFLARE_R2_ACCESS_LEVEL_MAP).map(([accessLevel, label]) => (
                  <SelectItem key={accessLevel} value={accessLevel}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
      </TabPanel>
      <TabPanel value={ParameterTab.Restrictions}>
        <IpListField
          control={control}
          name="parameters.allowedIps"
          label="Allowed IPs"
          tooltipText="The generated access key can only be used from these IP addresses or CIDR blocks. One entry per line. Leave empty to allow any IP."
        />
        <IpListField
          control={control}
          name="parameters.disallowedIps"
          label="Disallowed IPs"
          tooltipText="The generated access key cannot be used from these IP addresses or CIDR blocks. One entry per line."
        />
      </TabPanel>
    </Tabs>
  );
};
