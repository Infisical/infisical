import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import ms from "ms";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";
import { getObjectFromSeconds } from "@app/helpers/datetime";
import {
  accessTokenTtlSchema,
  DEFAULT_TRUSTED_IPS,
  mapTrustedIpsFromServer,
  superRefineAccessTokenTtl,
  trustedIpsSchema
} from "@app/helpers/identityAuthSchemas";
import { useScopeVariant } from "@app/hooks";
import {
  useAddIdentityUniversalAuth,
  useGetIdentityUniversalAuth,
  useUpdateIdentityUniversalAuth
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { LOCKOUT_DEFAULT_VALUES } from "./lockout/constants";
import { LockoutTab } from "./lockout/LockoutTab";
import { superRefineLockout } from "./lockout/super-refine";
import { AccessTokenNumUsesLimitField } from "./shared/AccessTokenNumUsesLimitField";
import { AccessTokenTtlFields } from "./shared/AccessTokenTtlFields";
import { TrustedIpsField } from "./shared/TrustedIpsField";
import { IDENTITY_AUTH_FORM_ID, IdentityFormTab } from "./types";

const buildSchema = (maxAccessTokenTTL: number) =>
  z
    .object({
      accessTokenTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token TTL"),
      accessTokenMaxTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token Max TTL"),
      accessTokenPeriod: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token Period").optional(),
      accessTokenNumUsesLimit: z.string(),
      clientSecretTrustedIps: trustedIpsSchema,
      accessTokenTrustedIps: trustedIpsSchema,
      lockoutEnabled: z.boolean().default(true),
      lockoutThreshold: z
        .string()
        .refine(
          (value) => Number(value) <= 30 && Number(value) >= 1,
          "Lockout threshold must be between 1 and 30"
        ),
      lockoutDurationValue: z.string(),
      lockoutDurationUnit: z.enum(["s", "m", "h", "d"], {
        invalid_type_error: "Please select a valid time unit"
      }),
      lockoutCounterResetValue: z.string(),
      lockoutCounterResetUnit: z.enum(["s", "m", "h"], {
        invalid_type_error: "Please select a valid time unit"
      })
    })
    .required()
    .superRefine(superRefineLockout)
    .superRefine(superRefineAccessTokenTtl);

export type FormData = z.infer<ReturnType<typeof buildSchema>>;

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["upgradePlan"]>,
    data?: { featureName?: string }
  ) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityAuthMethod"]>,
    state?: boolean
  ) => void;
  identityId?: string;
  isUpdate?: boolean;
  maxAccessTokenTTL: number;
  onSubmittingChange?: (isSubmitting: boolean) => void;
};

export const IdentityUniversalAuthForm = ({
  handlePopUpOpen,
  handlePopUpToggle,
  identityId,
  isUpdate,
  maxAccessTokenTTL,
  onSubmittingChange
}: Props) => {
  const { projectId } = useParams({
    strict: false
  });
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();
  const scopeVariant = useScopeVariant();
  const { mutateAsync: addMutateAsync } = useAddIdentityUniversalAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityUniversalAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data } = useGetIdentityUniversalAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const resolver = useMemo(() => zodResolver(buildSchema(maxAccessTokenTTL)), [maxAccessTokenTTL]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
    watch,
    trigger
  } = useForm<FormData>({
    resolver,
    defaultValues: {
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "",
      clientSecretTrustedIps: DEFAULT_TRUSTED_IPS,
      accessTokenTrustedIps: DEFAULT_TRUSTED_IPS,
      accessTokenPeriod: "0",
      ...LOCKOUT_DEFAULT_VALUES
    }
  });

  const accessTokenPeriodValue = Number(watch("accessTokenPeriod"));

  const lockoutEnabledWatch = watch("lockoutEnabled");
  const lockoutThresholdWatch = watch("lockoutThreshold");
  const lockoutDurationValueWatch = watch("lockoutDurationValue");
  const lockoutDurationUnitWatch = watch("lockoutDurationUnit");
  const lockoutCounterResetValueWatch = watch("lockoutCounterResetValue");
  const lockoutCounterResetUnitWatch = watch("lockoutCounterResetUnit");

  useEffect(() => {
    if (data) {
      const lockoutDurationObj = getObjectFromSeconds(data.lockoutDurationSeconds);
      const lockoutCounterResetObj = getObjectFromSeconds(data.lockoutCounterResetSeconds);

      reset({
        accessTokenTTL: String(data.accessTokenTTL),
        accessTokenMaxTTL: String(data.accessTokenMaxTTL),
        accessTokenNumUsesLimit: data.accessTokenNumUsesLimit
          ? String(data.accessTokenNumUsesLimit)
          : "",
        accessTokenPeriod: String(data.accessTokenPeriod),
        clientSecretTrustedIps: mapTrustedIpsFromServer(data.clientSecretTrustedIps),
        accessTokenTrustedIps: mapTrustedIpsFromServer(data.accessTokenTrustedIps),
        lockoutEnabled: data.lockoutEnabled,
        lockoutThreshold: String(data.lockoutThreshold),
        lockoutDurationValue: String(lockoutDurationObj.value),
        lockoutDurationUnit: lockoutDurationObj.unit as "s" | "m" | "h" | "d",
        lockoutCounterResetValue: String(lockoutCounterResetObj.value),
        lockoutCounterResetUnit: lockoutCounterResetObj.unit as "s" | "m" | "h"
      });
    } else {
      reset({
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "",
        accessTokenPeriod: "0",
        clientSecretTrustedIps: DEFAULT_TRUSTED_IPS,
        accessTokenTrustedIps: DEFAULT_TRUSTED_IPS,
        ...LOCKOUT_DEFAULT_VALUES
      });
    }
  }, [data]);

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const onFormSubmit = async ({
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    clientSecretTrustedIps,
    accessTokenTrustedIps,
    accessTokenPeriod,
    lockoutEnabled,
    lockoutThreshold,
    lockoutDurationValue,
    lockoutDurationUnit,
    lockoutCounterResetValue,
    lockoutCounterResetUnit
  }: FormData) => {
    if (!identityId) return;

    const lockoutDurationSeconds = ms(`${lockoutDurationValue}${lockoutDurationUnit}`) / 1000;
    const lockoutCounterResetSeconds =
      ms(`${lockoutCounterResetValue}${lockoutCounterResetUnit}`) / 1000;

    if (data) {
      // update universal auth configuration
      await updateMutateAsync({
        ...(projectId ? { projectId } : { organizationId: orgId }),
        identityId,
        clientSecretTrustedIps,
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit || "0"),
        accessTokenTrustedIps,
        accessTokenPeriod: Number(accessTokenPeriod),
        lockoutEnabled,
        lockoutThreshold: Number(lockoutThreshold),
        lockoutDurationSeconds,
        lockoutCounterResetSeconds
      });
    } else {
      // create new universal auth configuration

      await addMutateAsync({
        ...(projectId ? { projectId } : { organizationId: orgId }),
        identityId,
        clientSecretTrustedIps,
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit || "0"),
        accessTokenTrustedIps,
        accessTokenPeriod: Number(accessTokenPeriod),
        lockoutEnabled,
        lockoutThreshold: Number(lockoutThreshold),
        lockoutDurationSeconds: Number(lockoutDurationSeconds),
        lockoutCounterResetSeconds: Number(lockoutCounterResetSeconds)
      });
    }

    handlePopUpToggle("identityAuthMethod", false);

    createNotification({
      text: `Successfully ${isUpdate ? "updated" : "created"} auth method`,
      type: "success"
    });
    reset();
  };

  return (
    <form
      id={IDENTITY_AUTH_FORM_ID}
      onSubmit={handleSubmit(onFormSubmit, (fields) => {
        const firstErrorField = Object.keys(fields)[0];
        let tab = IdentityFormTab.Configuration;

        if (["accessTokenTrustedIps", "clientSecretTrustedIps"].includes(firstErrorField)) {
          tab = IdentityFormTab.Advanced;
        } else if (
          [
            "lockoutEnabled",
            "lockoutThreshold",
            "lockoutDurationValue",
            "lockoutDurationUnit",
            "lockoutCounterResetValue",
            "lockoutCounterResetUnit"
          ].includes(firstErrorField)
        ) {
          tab = IdentityFormTab.Lockout;
        }

        setTabValue(tab);
      })}
    >
      <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as IdentityFormTab)}>
        <TabsList variant={scopeVariant}>
          <TabsTrigger value={IdentityFormTab.Configuration}>Configuration</TabsTrigger>
          <TabsTrigger value={IdentityFormTab.Lockout}>Lockout</TabsTrigger>
          <TabsTrigger value={IdentityFormTab.Advanced}>Advanced</TabsTrigger>
        </TabsList>
        <TabsContent value={IdentityFormTab.Configuration}>
          <FieldGroup>
            {accessTokenPeriodValue > 0 ? (
              <div className="text-xs text-muted">
                When Access Token Period is set, TTL and Max TTL are ignored.
              </div>
            ) : (
              <AccessTokenTtlFields control={control} maxAccessTokenTTL={maxAccessTokenTTL} />
            )}
            <AccessTokenNumUsesLimitField control={control} />
            <Controller
              control={control}
              defaultValue="0"
              name="accessTokenPeriod"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="accessTokenPeriod">Access Token Period (seconds)</FieldLabel>
                  <Input
                    {...field}
                    id="accessTokenPeriod"
                    placeholder="0"
                    type="number"
                    min="0"
                    step="1"
                    isError={Boolean(error)}
                  />
                  <FieldDescription>
                    For periodic tokens: set a period (in seconds) to allow indefinite renewal. Set
                    to 0 to disable periodic tokens and use TTL-based expiration.
                  </FieldDescription>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          </FieldGroup>
        </TabsContent>
        <LockoutTab
          control={control}
          trigger={trigger}
          lockoutEnabled={lockoutEnabledWatch}
          lockoutThreshold={lockoutThresholdWatch}
          lockoutDurationValue={lockoutDurationValueWatch}
          lockoutDurationUnit={lockoutDurationUnitWatch}
          lockoutCounterResetValue={lockoutCounterResetValueWatch}
          lockoutCounterResetUnit={lockoutCounterResetUnitWatch}
        />
        <TabsContent value={IdentityFormTab.Advanced}>
          <FieldGroup>
            <TrustedIpsField
              control={control}
              name="clientSecretTrustedIps"
              label="Client Secret Trusted IPs"
              isAllowed={Boolean(subscription?.ipAllowlisting)}
              onUpgradeRequired={() =>
                handlePopUpOpen("upgradePlan", { featureName: "IP allowlisting" })
              }
            />
            <TrustedIpsField
              control={control}
              name="accessTokenTrustedIps"
              label="Access Token Trusted IPs"
              isAllowed={Boolean(subscription?.ipAllowlisting)}
              onUpgradeRequired={() =>
                handlePopUpOpen("upgradePlan", { featureName: "IP allowlisting" })
              }
            />
          </FieldGroup>
        </TabsContent>
      </Tabs>
    </form>
  );
};
