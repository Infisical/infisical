import { useEffect, useMemo } from "react";
import { Control, Controller, useFieldArray, useFormContext } from "react-hook-form";
import { MultiValue, SingleValue } from "react-select";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import {
  Button,
  FilterableSelect,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
import {
  TCloudflarePermissionGroup,
  TCloudflareZone,
  useCloudflareConnectionListPermissionGroups,
  useCloudflareConnectionListZones
} from "@app/hooks/api/appConnections/cloudflare";

import {
  CLOUDFLARE_POLICY_EFFECT_MAP,
  CLOUDFLARE_POLICY_SCOPE_MAP,
  CLOUDFLARE_POLICY_SCOPE_RESOURCE_MAP,
  CloudflareApiTokenPolicyEffect,
  CloudflareApiTokenPolicyScope,
  CloudflareApiTokenRotationSchema,
  explodePolicies,
  isStoredPolicy
} from "../schemas/cloudflare-api-token-rotation-schema";
import { CLOUDFLARE_TOKEN_NAME_MAX_LENGTH } from "../schemas/shared";
import { CloudflareIpListInput } from "./shared";

// The schema merges policy rows into the stored shape on submit, so `TSecretRotationV2Form` (the
// schema's *output* type) describes merged policies. The fields here edit rows, which is the input side.
type TCloudflareApiTokenForm = z.input<typeof CloudflareApiTokenRotationSchema>;

const DEFAULT_POLICY = {
  effect: CloudflareApiTokenPolicyEffect.Allow,
  scope: CloudflareApiTokenPolicyScope.Account,
  zoneIds: [],
  permissionGroupId: ""
};

enum ParameterTab {
  General = "general",
  Restrictions = "restrictions"
}

const IpListField = ({
  control,
  name,
  label,
  tooltipText
}: {
  control: Control<TCloudflareApiTokenForm>;
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

export const CloudflareApiTokenRotationParametersFields = () => {
  const { control, watch, setValue, getValues } = useFormContext<TCloudflareApiTokenForm>();

  const connectionId = watch("connection.id");
  const policies = watch("parameters.policies");

  // account-scoped: a zone outside the connection's account can't appear in an account token's policy
  const { data: zones, isPending: isZonesPending } = useCloudflareConnectionListZones(
    connectionId,
    { enabled: Boolean(connectionId) },
    true
  );

  const { data: permissionGroups, isPending: isPermissionGroupsPending } =
    useCloudflareConnectionListPermissionGroups(connectionId, {
      enabled: Boolean(connectionId)
    });

  const policyFields = useFieldArray({
    control,
    name: "parameters.policies"
  });

  // Seed a first row on create, and on edit expand the stored merged policies into one row per
  // permission group so the field array has something row-shaped to render.
  useEffect(() => {
    const currentPolicies = getValues("parameters.policies");

    if (!currentPolicies?.length) {
      setValue("parameters.policies", [DEFAULT_POLICY]);
      return;
    }

    // the form type says rows, but `defaultValues` really does hand us the stored shape on edit
    const storedPolicies = (currentPolicies as unknown[]).filter(isStoredPolicy);

    if (storedPolicies.length) {
      setValue("parameters.policies", explodePolicies(storedPolicies));
    }
  }, []);

  // A permission group can only be attached to the resource types listed in its `scopes`. Groups that
  // report no scopes are kept in every list so an upstream response change can't empty the dropdown.
  const permissionGroupsByScope = useMemo(() => {
    const filterByScope = (scope: CloudflareApiTokenPolicyScope) =>
      (permissionGroups ?? []).filter(
        (group) =>
          !group.scopes.length || group.scopes.includes(CLOUDFLARE_POLICY_SCOPE_RESOURCE_MAP[scope])
      );

    return {
      [CloudflareApiTokenPolicyScope.Account]: filterByScope(CloudflareApiTokenPolicyScope.Account),
      [CloudflareApiTokenPolicyScope.AllZones]: filterByScope(
        CloudflareApiTokenPolicyScope.AllZones
      ),
      [CloudflareApiTokenPolicyScope.Zones]: filterByScope(CloudflareApiTokenPolicyScope.Zones)
    };
  }, [permissionGroups]);

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
              tooltipText="The name for the generated Cloudflare API token. A timestamp is appended so each rotated token is distinct."
            >
              <Input
                {...field}
                placeholder="infisical-rotated-token"
                maxLength={CLOUDFLARE_TOKEN_NAME_MAX_LENGTH}
              />
            </FormControl>
          )}
        />
        <FormLabel
          label="Access Policies"
          tooltipText="Each row grants one permission group over the entire account, all zones in the account, or a specific set of zones. Rows targeting the same resources are combined into a single Cloudflare policy."
        />
        <div
          className={twMerge(
            "mb-3 flex w-full flex-col space-y-2",
            policyFields.fields.length >= 3 ? "max-h-96 overflow-y-auto" : ""
          )}
        >
          {policyFields.fields.map(({ id: policyFieldId }, i) => {
            const policyScope = policies?.[i]?.scope ?? CloudflareApiTokenPolicyScope.Account;
            const permissionGroupOptions = permissionGroupsByScope[policyScope];
            const showZones = policyScope === CloudflareApiTokenPolicyScope.Zones;

            return (
              // A card per policy rather than one flat row: four selects side by side don't fit the
              // modal width, and cramming them wraps the placeholders and misaligns the labels.
              <div
                key={policyFieldId}
                className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-mineshaft-400">Policy {i + 1}</span>
                  <IconButton
                    ariaLabel="delete policy"
                    variant="plain"
                    colorSchema="danger"
                    onClick={() => {
                      const currentPolicies = getValues("parameters.policies");
                      if (currentPolicies && currentPolicies.length > 1) {
                        policyFields.remove(i);
                      } else {
                        setValue("parameters.policies", [DEFAULT_POLICY]);
                      }
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </div>
                <div className="grid grid-cols-2 gap-x-3">
                  <Controller
                    control={control}
                    name={`parameters.policies.${i}.effect`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        label="Effect"
                        className="mb-0"
                      >
                        <Select
                          className="w-full"
                          position="popper"
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          {Object.entries(CLOUDFLARE_POLICY_EFFECT_MAP).map(([effect, label]) => (
                            <SelectItem key={effect} value={effect}>
                              {label}
                            </SelectItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                  <Controller
                    control={control}
                    name={`parameters.policies.${i}.scope`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        label="Scope"
                        className="mb-0"
                      >
                        <Select
                          className="w-full"
                          position="popper"
                          value={field.value}
                          onValueChange={(scope) => {
                            field.onChange(scope);
                            // the zones and permission group from the previous scope no longer apply
                            setValue(`parameters.policies.${i}.zoneIds`, []);
                            setValue(`parameters.policies.${i}.permissionGroupId`, "");
                          }}
                        >
                          {Object.entries(CLOUDFLARE_POLICY_SCOPE_MAP).map(([scope, label]) => (
                            <SelectItem key={scope} value={scope}>
                              {label}
                            </SelectItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                  {showZones && (
                    <Controller
                      control={control}
                      name={`parameters.policies.${i}.zoneIds`}
                      render={({ field: { value, onChange }, fieldState: { error } }) => (
                        <FormControl
                          isError={Boolean(error?.message)}
                          errorText={error?.message}
                          label="Zones"
                          className="mt-3 mb-0"
                        >
                          <FilterableSelect
                            isMulti
                            isLoading={isZonesPending && Boolean(connectionId)}
                            isDisabled={!connectionId}
                            options={zones}
                            placeholder="Select zones..."
                            getOptionLabel={(option) => option.name}
                            getOptionValue={(option) => option.id}
                            value={zones?.filter((zone) => (value ?? []).includes(zone.id)) ?? []}
                            onChange={(option) =>
                              onChange(
                                (option as MultiValue<TCloudflareZone>).map((zone) => zone.id)
                              )
                            }
                          />
                        </FormControl>
                      )}
                    />
                  )}
                  <Controller
                    control={control}
                    name={`parameters.policies.${i}.permissionGroupId`}
                    render={({ field: { value, onChange }, fieldState: { error } }) => (
                      <FormControl
                        isError={Boolean(error?.message)}
                        errorText={error?.message}
                        label="Permission group"
                        // fills the row when there's no zone picker beside it
                        className={twMerge("mt-3 mb-0", showZones ? "" : "col-span-2")}
                      >
                        <FilterableSelect
                          isLoading={isPermissionGroupsPending && Boolean(connectionId)}
                          isDisabled={!connectionId}
                          options={permissionGroupOptions}
                          placeholder="Select a permission group..."
                          getOptionLabel={(option) => option.name}
                          getOptionValue={(option) => option.id}
                          value={permissionGroupOptions.find((group) => group.id === value) ?? null}
                          onChange={(option) =>
                            onChange((option as SingleValue<TCloudflarePermissionGroup>)?.id ?? "")
                          }
                        />
                      </FormControl>
                    )}
                  />
                </div>
              </div>
            );
          })}
          <div>
            <Button
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              size="xs"
              variant="outline_bg"
              onClick={() => policyFields.append(DEFAULT_POLICY)}
            >
              Add policy
            </Button>
          </div>
        </div>
      </TabPanel>
      <TabPanel value={ParameterTab.Restrictions}>
        <IpListField
          control={control}
          name="parameters.allowedIps"
          label="Allowed IPs"
          tooltipText="The generated token can only be used from these IP addresses or CIDR blocks. One entry per line. Leave empty to allow any IP."
        />
        <IpListField
          control={control}
          name="parameters.disallowedIps"
          label="Disallowed IPs"
          tooltipText="The generated token cannot be used from these IP addresses or CIDR blocks. One entry per line."
        />
      </TabPanel>
    </Tabs>
  );
};
