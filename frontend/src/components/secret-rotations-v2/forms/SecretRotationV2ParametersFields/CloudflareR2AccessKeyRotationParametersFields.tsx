import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
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
  r2BucketKey,
  TCloudflareR2BucketSelection
} from "../schemas/cloudflare-r2-access-key-rotation-schema";
import { CLOUDFLARE_TOKEN_NAME_MAX_LENGTH } from "../schemas/shared";
import { CloudflareIpListField } from "./shared";

type TCloudflareR2AccessKeyForm = TSecretRotationV2Form & {
  type: SecretRotation.CloudflareR2AccessKey;
};

enum ParameterTab {
  General = "general",
  Restrictions = "restrictions"
}

// One source for the picker label's content and order: the JSX dims the jurisdiction, and react-select
// filters on the plain-text join, so the two must not drift apart.
const bucketLabelParts = ({ name, jurisdiction }: TCloudflareR2BucketSelection) =>
  [name, CLOUDFLARE_R2_JURISDICTION_MAP[jurisdiction]] as const;

const formatBucketOptionLabel = (bucket: TCloudflareR2BucketSelection) => {
  const [name, jurisdiction] = bucketLabelParts(bucket);

  return (
    <span>
      {name} <span className="text-mineshaft-400">{jurisdiction}</span>
    </span>
  );
};

const getBucketSearchLabel = (bucket: TCloudflareR2BucketSelection) =>
  bucketLabelParts(bucket).join(" ");

export const CloudflareR2AccessKeyRotationParametersFields = () => {
  const { control, watch } = useFormContext<TCloudflareR2AccessKeyForm>();

  const connectionId = watch("connection.id");
  const selectedBuckets = watch("parameters.buckets");

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
                // the form field holds the option shape itself, and react-select matches selections by
                // `getOptionValue`, so the stored value can be handed back as-is
                value={value ?? []}
                onChange={(option) => onChange(option as MultiValue<TCloudflareR2BucketSelection>)}
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
        <CloudflareIpListField
          control={control}
          name="parameters.allowedIps"
          label="Allowed IPs"
          tooltipText="The generated access key can only be used from these IP addresses or CIDR blocks. One entry per line. Leave empty to allow any IP."
        />
        <CloudflareIpListField
          control={control}
          name="parameters.disallowedIps"
          label="Disallowed IPs"
          tooltipText="The generated access key cannot be used from these IP addresses or CIDR blocks. One entry per line."
        />
      </TabPanel>
    </Tabs>
  );
};
