import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";
import {
  accessTokenTtlSchema,
  DEFAULT_TRUSTED_IPS,
  mapTrustedIpsFromServer,
  superRefineAccessTokenTtl,
  trustedIpsSchema
} from "@app/helpers/identityAuthSchemas";
import { useScopeVariant } from "@app/hooks";
import { useAddIdentitySpiffeAuth, useUpdateIdentitySpiffeAuth } from "@app/hooks/api";
import { SpiffeTrustBundleProfile } from "@app/hooks/api/identities/enums";
import { useGetIdentitySpiffeAuth } from "@app/hooks/api/identities/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AccessTokenNumUsesLimitField } from "./shared/AccessTokenNumUsesLimitField";
import { AccessTokenTtlFields } from "./shared/AccessTokenTtlFields";
import { TrustedIpsField } from "./shared/TrustedIpsField";
import { IDENTITY_AUTH_FORM_ID, IdentityFormTab } from "./types";

const trustBundleDistributionSchema = z.discriminatedUnion("profile", [
  z.object({
    profile: z.literal(SpiffeTrustBundleProfile.STATIC),
    bundle: z.string().trim().min(1, "CA Bundle JWKS is required for static configuration")
  }),
  z.object({
    profile: z.literal(SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE),
    endpointUrl: z.string().trim().url("Must be a valid URL"),
    caCert: z.string().trim().optional().default(""),
    refreshHintSeconds: z.string().default("3600")
  })
]);

const buildSchema = (maxAccessTokenTTL: number) => {
  const common = z.object({
    trustDomain: z.string().trim().min(1, "Trust domain is required"),
    allowedSpiffeIds: z.string().trim().min(1, "Allowed SPIFFE IDs are required"),
    allowedAudiences: z.string().trim().min(1, "Allowed audiences are required"),
    accessTokenTrustedIps: trustedIpsSchema,
    accessTokenTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token TTL"),
    accessTokenMaxTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token Max TTL"),
    accessTokenNumUsesLimit: z.string()
  });
  return common
    .extend({ trustBundleDistribution: trustBundleDistributionSchema })
    .superRefine(superRefineAccessTokenTtl);
};

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

export const IdentitySpiffeAuthForm = ({
  handlePopUpOpen,
  handlePopUpToggle,
  identityId,
  isUpdate,
  maxAccessTokenTTL,
  onSubmittingChange
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();
  const { projectId } = useParams({
    strict: false
  });
  const scopeVariant = useScopeVariant();
  const { mutateAsync: addMutateAsync } = useAddIdentitySpiffeAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentitySpiffeAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data } = useGetIdentitySpiffeAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const resolver = useMemo(() => zodResolver(buildSchema(maxAccessTokenTTL)), [maxAccessTokenTTL]);

  const {
    watch,
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver,
    defaultValues: {
      trustDomain: "",
      allowedSpiffeIds: "",
      allowedAudiences: "",
      trustBundleDistribution: {
        profile: SpiffeTrustBundleProfile.STATIC,
        bundle: ""
      },
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "",
      accessTokenTrustedIps: DEFAULT_TRUSTED_IPS
    }
  });

  const selectedProfile = watch("trustBundleDistribution.profile");

  useEffect(() => {
    if (data) {
      const dist = data.trustBundleDistribution;
      let trustBundleDistribution: FormData["trustBundleDistribution"];

      switch (dist.profile) {
        case SpiffeTrustBundleProfile.STATIC:
          trustBundleDistribution = {
            profile: SpiffeTrustBundleProfile.STATIC,
            bundle: dist.bundle || ""
          };
          break;
        case SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE:
          trustBundleDistribution = {
            profile: SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE,
            endpointUrl: dist.endpointUrl || "",
            caCert: dist.caCert || "",
            refreshHintSeconds: String(dist.refreshHintSeconds ?? 3600)
          };
          break;
        default:
          trustBundleDistribution = {
            profile: SpiffeTrustBundleProfile.STATIC,
            bundle: ""
          };
      }

      reset({
        trustDomain: data.trustDomain,
        allowedSpiffeIds: data.allowedSpiffeIds,
        allowedAudiences: data.allowedAudiences,
        trustBundleDistribution,
        accessTokenTTL: String(data.accessTokenTTL),
        accessTokenMaxTTL: String(data.accessTokenMaxTTL),
        accessTokenNumUsesLimit: data.accessTokenNumUsesLimit
          ? String(data.accessTokenNumUsesLimit)
          : "",
        accessTokenTrustedIps: mapTrustedIpsFromServer(data.accessTokenTrustedIps)
      });
    }
  }, [data]);

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const onFormSubmit = async ({
    accessTokenTrustedIps,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    trustDomain,
    allowedSpiffeIds,
    allowedAudiences,
    trustBundleDistribution
  }: FormData) => {
    if (!identityId) {
      return;
    }

    // Build the trust bundle distribution with correct number types
    const buildDistribution = () => {
      switch (trustBundleDistribution.profile) {
        case SpiffeTrustBundleProfile.STATIC:
          return {
            profile: trustBundleDistribution.profile,
            bundle: trustBundleDistribution.bundle
          };
        case SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE:
          return {
            profile: trustBundleDistribution.profile,
            endpointUrl: trustBundleDistribution.endpointUrl,
            caCert: trustBundleDistribution.caCert,
            refreshHintSeconds: Number(trustBundleDistribution.refreshHintSeconds)
          };
        default:
          return { profile: SpiffeTrustBundleProfile.STATIC as const, bundle: "" };
      }
    };

    if (data) {
      await updateMutateAsync({
        identityId,
        ...(projectId ? { projectId } : { organizationId: orgId }),
        trustDomain,
        allowedSpiffeIds,
        allowedAudiences,
        trustBundleDistribution: buildDistribution(),
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit || "0"),
        accessTokenTrustedIps
      });
    } else {
      await addMutateAsync({
        identityId,
        ...(projectId ? { projectId } : { organizationId: orgId }),
        trustDomain,
        allowedSpiffeIds,
        allowedAudiences,
        trustBundleDistribution: buildDistribution(),
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit || "0"),
        accessTokenTrustedIps
      });
    }

    handlePopUpToggle("identityAuthMethod", false);

    createNotification({
      text: `Successfully ${isUpdate ? "updated" : "configured"} auth method`,
      type: "success"
    });
    reset();
  };

  return (
    <form
      id={IDENTITY_AUTH_FORM_ID}
      onSubmit={handleSubmit(onFormSubmit, (fields) => {
        setTabValue(
          ["accessTokenTrustedIps"].includes(Object.keys(fields)[0])
            ? IdentityFormTab.Advanced
            : IdentityFormTab.Configuration
        );
      })}
    >
      <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as IdentityFormTab)}>
        <TabsList variant={scopeVariant}>
          <TabsTrigger value={IdentityFormTab.Configuration}>Configuration</TabsTrigger>
          <TabsTrigger value={IdentityFormTab.Advanced}>Advanced</TabsTrigger>
        </TabsList>
        <TabsContent value={IdentityFormTab.Configuration}>
          <FieldGroup>
            <Controller
              control={control}
              name="trustBundleDistribution.profile"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="trustBundleProfile">Trust Bundle Profile</FieldLabel>
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger
                      id="trustBundleProfile"
                      className="w-full"
                      isError={Boolean(error)}
                    >
                      <SelectValue placeholder="Select trust bundle profile" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value={SpiffeTrustBundleProfile.STATIC}>Static</SelectItem>
                      <SelectItem value={SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE}>
                        HTTPS Web Bundle
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="trustDomain"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="trustDomain">Trust Domain</FieldLabel>
                  <Input
                    {...field}
                    id="trustDomain"
                    type="text"
                    placeholder="example.org"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="allowedSpiffeIds"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel
                    htmlFor="allowedSpiffeIds"
                    className="inline-flex items-center gap-1.5"
                  >
                    Allowed SPIFFE IDs
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        <div className="flex flex-col gap-2">
                          <p>Comma-separated list of SPIFFE IDs allowed to authenticate.</p>
                          <div className="flex flex-col gap-2 border-t border-foreground/10 pt-2">
                            <p className="text-accent">Glob patterns supported:</p>
                            <div className="flex items-center gap-1.5">
                              <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-xs">
                                *
                              </code>
                              <span>matches a single path segment</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <code className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-xs">
                                **
                              </code>
                              <span>matches across multiple segments</span>
                            </div>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <TextArea
                    {...field}
                    id="allowedSpiffeIds"
                    placeholder="spiffe://example.org/ns/*/sa/admin, spiffe://example.org/workloads/**"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="allowedAudiences"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="allowedAudiences">Allowed Audiences</FieldLabel>
                  <Input
                    {...field}
                    id="allowedAudiences"
                    type="text"
                    placeholder="Comma-separated (e.g. aud1, aud2)"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            {selectedProfile === SpiffeTrustBundleProfile.STATIC && (
              <Controller
                control={control}
                name="trustBundleDistribution.bundle"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="trustBundleBundle">CA Bundle JWKS</FieldLabel>
                    <TextArea
                      {...field}
                      id="trustBundleBundle"
                      placeholder="Paste SPIRE JWKS JSON"
                      isError={Boolean(error)}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
            )}
            {selectedProfile === SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE && (
              <>
                <Controller
                  control={control}
                  name="trustBundleDistribution.endpointUrl"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="trustBundleEndpointUrl">Bundle Endpoint URL</FieldLabel>
                      <Input
                        {...field}
                        id="trustBundleEndpointUrl"
                        type="text"
                        placeholder="https://spire-server:8443"
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="trustBundleDistribution.caCert"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="trustBundleCaCert">
                        Root CA Certificate (optional)
                      </FieldLabel>
                      <TextArea
                        {...field}
                        id="trustBundleCaCert"
                        placeholder="-----BEGIN CERTIFICATE----- ..."
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="trustBundleDistribution.refreshHintSeconds"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="trustBundleRefreshHint">
                        Bundle Refresh Hint (seconds)
                      </FieldLabel>
                      <Input
                        {...field}
                        id="trustBundleRefreshHint"
                        placeholder="3600"
                        type="number"
                        min="0"
                        step="1"
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </>
            )}
            <AccessTokenTtlFields control={control} maxAccessTokenTTL={maxAccessTokenTTL} />
            <AccessTokenNumUsesLimitField control={control} />
          </FieldGroup>
        </TabsContent>
        <TabsContent value={IdentityFormTab.Advanced}>
          <FieldGroup>
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
