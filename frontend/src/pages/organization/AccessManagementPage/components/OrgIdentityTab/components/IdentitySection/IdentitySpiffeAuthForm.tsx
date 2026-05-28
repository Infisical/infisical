import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { InfoIcon, PlusIcon, XIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  IconButton,
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
import { SECONDS_PER_DAY } from "@app/helpers/datetime";
import { accessTokenTtlSchema } from "@app/helpers/identityAuthSchemas";
import { useScopeVariant } from "@app/hooks";
import { useAddIdentitySpiffeAuth, useUpdateIdentitySpiffeAuth } from "@app/hooks/api";
import { SpiffeTrustBundleProfile } from "@app/hooks/api/identities/enums";
import { useGetIdentitySpiffeAuth } from "@app/hooks/api/identities/queries";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

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
    accessTokenTrustedIps: z
      .array(
        z.object({
          ipAddress: z.string().max(50)
        })
      )
      .min(1),
    accessTokenTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token TTL"),
    accessTokenMaxTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token Max TTL"),
    accessTokenNumUsesLimit: z.string()
  });
  return common.extend({ trustBundleDistribution: trustBundleDistributionSchema });
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
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
    }
  });

  const selectedProfile = watch("trustBundleDistribution.profile");

  const {
    fields: accessTokenTrustedIpsFields,
    append: appendAccessTokenTrustedIp,
    remove: removeAccessTokenTrustedIp
  } = useFieldArray({ control, name: "accessTokenTrustedIps" });

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
        accessTokenTrustedIps: data.accessTokenTrustedIps.map(
          ({ ipAddress, prefix }: IdentityTrustedIp) => {
            return {
              ipAddress: `${ipAddress}${prefix !== undefined ? `/${prefix}` : ""}`
            };
          }
        )
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

  const maxDaysHelper = `Max: ${Math.floor(maxAccessTokenTTL / SECONDS_PER_DAY)} days`;

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
                    <SelectContent>
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
                  <FieldLabel htmlFor="allowedSpiffeIds">Allowed SPIFFE IDs</FieldLabel>
                  <TextArea
                    {...field}
                    id="allowedSpiffeIds"
                    placeholder="Comma-separated list of SPIFFE IDs allowed to authenticate. Glob patterns supported: * matches a single path segment, ** matches across multiple segments (e.g. spiffe://example.org/ns/*/sa/admin, spiffe://example.org/workloads/**)"
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
            <Controller
              control={control}
              defaultValue="2592000"
              name="accessTokenTTL"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="accessTokenTTL">Access Token TTL (seconds)</FieldLabel>
                  <Input
                    {...field}
                    id="accessTokenTTL"
                    placeholder="2592000"
                    type="number"
                    min="1"
                    step="1"
                    isError={Boolean(error)}
                  />
                  <FieldDescription>{maxDaysHelper}</FieldDescription>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              defaultValue="2592000"
              name="accessTokenMaxTTL"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="accessTokenMaxTTL">
                    Access Token Max TTL (seconds)
                  </FieldLabel>
                  <Input
                    {...field}
                    id="accessTokenMaxTTL"
                    placeholder="2592000"
                    type="number"
                    min="1"
                    step="1"
                    isError={Boolean(error)}
                  />
                  <FieldDescription>{maxDaysHelper}</FieldDescription>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              defaultValue="0"
              name="accessTokenNumUsesLimit"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel
                    htmlFor="accessTokenNumUsesLimit"
                    className="inline-flex items-center gap-1.5"
                  >
                    Access Token Max Number of Uses
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent>
                        The maximum number of times that an access token can be used; leave blank
                        for unlimited uses.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="accessTokenNumUsesLimit"
                    placeholder="Unlimited uses"
                    type="number"
                    min="0"
                    step="1"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
          </FieldGroup>
        </TabsContent>
        <TabsContent value={IdentityFormTab.Advanced}>
          <FieldGroup>
            <div className="flex flex-col gap-3">
              {accessTokenTrustedIpsFields.map(({ id }, index) => (
                <div className="flex items-start gap-2" key={id}>
                  <Controller
                    control={control}
                    name={`accessTokenTrustedIps.${index}.ipAddress`}
                    defaultValue="0.0.0.0/0"
                    render={({ field, fieldState: { error } }) => (
                      <Field className="flex-1">
                        {index === 0 && (
                          <FieldLabel htmlFor={`trustedIp-${index}`}>
                            Access Token Trusted IPs
                          </FieldLabel>
                        )}
                        <Input
                          id={`trustedIp-${index}`}
                          value={field.value}
                          onChange={(e) => {
                            if (subscription?.ipAllowlisting) {
                              field.onChange(e);
                              return;
                            }
                            handlePopUpOpen("upgradePlan", {
                              featureName: "IP allowlisting"
                            });
                          }}
                          placeholder="123.456.789.0"
                          isError={Boolean(error)}
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Remove trusted IP"
                    className={index === 0 ? "mt-[1.625rem]" : "mt-0.5"}
                    onClick={() => {
                      if (subscription?.ipAllowlisting) {
                        removeAccessTokenTrustedIp(index);
                        return;
                      }
                      handlePopUpOpen("upgradePlan", {
                        featureName: "IP allowlisting"
                      });
                    }}
                  >
                    <XIcon />
                  </IconButton>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="w-fit"
                onClick={() => {
                  if (subscription?.ipAllowlisting) {
                    appendAccessTokenTrustedIp({ ipAddress: "0.0.0.0/0" });
                    return;
                  }
                  handlePopUpOpen("upgradePlan", {
                    featureName: "IP allowlisting"
                  });
                }}
              >
                <PlusIcon />
                Add IP Address
              </Button>
            </div>
          </FieldGroup>
        </TabsContent>
      </Tabs>
    </form>
  );
};
