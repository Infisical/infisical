import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { HelpCircleIcon, InfoIcon, PlusIcon, XIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { BashGlobPatternTooltip } from "@app/components/permissions";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  IconButton,
  Input,
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
import {
  accessTokenTtlSchema,
  DEFAULT_TRUSTED_IPS,
  mapTrustedIpsFromServer,
  trustedIpsSchema
} from "@app/helpers/identityAuthSchemas";
import { useScopeVariant } from "@app/hooks";
import { useAddIdentityOidcAuth, useUpdateIdentityOidcAuth } from "@app/hooks/api";
import { useGetIdentityOidcAuth } from "@app/hooks/api/identities/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { TrustedIpsField } from "./shared/TrustedIpsField";
import { IDENTITY_AUTH_FORM_ID, IdentityFormTab } from "./types";

const buildSchema = (maxAccessTokenTTL: number) =>
  z.object({
    accessTokenTrustedIps: trustedIpsSchema,
    accessTokenTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token TTL"),
    accessTokenMaxTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token Max TTL"),
    accessTokenNumUsesLimit: z.string(),
    oidcDiscoveryUrl: z
      .string()
      .url()
      .min(1)
      .refine(
        (el) => !el.endsWith("/.well-known/openid-configuration"),
        "Please remove /.well-known/openid-configuration."
      ),
    caCert: z.string().trim().default(""),
    boundIssuer: z.string().min(1),
    boundAudiences: z.string().optional().default(""),
    boundClaims: z
      .array(
        z.object({
          key: z.string(),
          value: z.string()
        })
      )
      .default([]),
    claimMetadataMapping: z
      .array(
        z.object({
          key: z.string(),
          value: z.string()
        })
      )
      .default([]),
    boundSubject: z.string().optional().default("")
  });

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

export const IdentityOidcAuthForm = ({
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
  const { mutateAsync: addMutateAsync } = useAddIdentityOidcAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityOidcAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data } = useGetIdentityOidcAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const resolver = useMemo(() => zodResolver(buildSchema(maxAccessTokenTTL)), [maxAccessTokenTTL]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver,
    defaultValues: {
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "",
      accessTokenTrustedIps: DEFAULT_TRUSTED_IPS,
      boundClaims: [],
      claimMetadataMapping: []
    }
  });
  const {
    fields: boundClaimsFields,
    append: appendBoundClaimField,
    remove: removeBoundClaimField
  } = useFieldArray({
    control,
    name: "boundClaims"
  });

  const {
    fields: claimMetadataMappingFields,
    append: appendClaimMetadataMappingField,
    remove: removeClaimMetadataMappingField
  } = useFieldArray({
    control,
    name: "claimMetadataMapping"
  });

  useEffect(() => {
    if (data) {
      reset({
        oidcDiscoveryUrl: data.oidcDiscoveryUrl,
        caCert: data.caCert,
        boundIssuer: data.boundIssuer,
        boundAudiences: data.boundAudiences,
        boundClaims: Object.entries(data.boundClaims).map(([key, value]) => ({
          key,
          value
        })),
        claimMetadataMapping: data?.claimMetadataMapping
          ? Object.entries(data.claimMetadataMapping).map(([key, value]) => ({
              key,
              value
            }))
          : undefined,
        boundSubject: data.boundSubject,
        accessTokenTTL: String(data.accessTokenTTL),
        accessTokenMaxTTL: String(data.accessTokenMaxTTL),
        accessTokenNumUsesLimit: data.accessTokenNumUsesLimit
          ? String(data.accessTokenNumUsesLimit)
          : "",
        accessTokenTrustedIps: mapTrustedIpsFromServer(data.accessTokenTrustedIps)
      });
    } else {
      reset({
        oidcDiscoveryUrl: "",
        caCert: "",
        boundIssuer: "",
        boundAudiences: "",
        boundClaims: [],
        boundSubject: "",
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "",
        accessTokenTrustedIps: DEFAULT_TRUSTED_IPS,
        claimMetadataMapping: []
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
    oidcDiscoveryUrl,
    caCert,
    boundIssuer,
    boundAudiences,
    boundClaims,
    claimMetadataMapping,
    boundSubject
  }: FormData) => {
    if (!identityId) {
      return;
    }

    if (data) {
      await updateMutateAsync({
        identityId,
        ...(projectId ? { projectId } : { organizationId: orgId }),
        oidcDiscoveryUrl,
        caCert,
        boundIssuer,
        boundAudiences,
        boundClaims: Object.fromEntries(boundClaims.map((entry) => [entry.key, entry.value])),
        claimMetadataMapping: claimMetadataMapping
          ? Object.fromEntries(claimMetadataMapping.map((entry) => [entry.key, entry.value]))
          : undefined,
        boundSubject,
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit || "0"),
        accessTokenTrustedIps
      });
    } else {
      await addMutateAsync({
        identityId,
        oidcDiscoveryUrl,
        caCert,
        boundIssuer,
        boundAudiences,
        boundClaims: Object.fromEntries(boundClaims.map((entry) => [entry.key, entry.value])),
        claimMetadataMapping: claimMetadataMapping
          ? Object.fromEntries(claimMetadataMapping.map((entry) => [entry.key, entry.value]))
          : undefined,
        boundSubject,
        ...(projectId ? { projectId } : { organizationId: orgId }),
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
          ["accessTokenTrustedIps", "caCert", "claimMetadataMapping"].includes(
            Object.keys(fields)[0]
          )
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
              name="oidcDiscoveryUrl"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="oidcDiscoveryUrl">OIDC Discovery URL</FieldLabel>
                  <Input
                    {...field}
                    id="oidcDiscoveryUrl"
                    placeholder="https://token.actions.githubusercontent.com"
                    type="text"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="boundIssuer"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="boundIssuer">Issuer</FieldLabel>
                  <Input
                    {...field}
                    id="boundIssuer"
                    type="text"
                    placeholder="https://token.actions.githubusercontent.com"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="boundSubject"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="boundSubject" className="inline-flex items-center gap-1.5">
                    Subject
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircleIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <BashGlobPatternTooltip />
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input {...field} id="boundSubject" type="text" isError={Boolean(error)} />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="boundAudiences"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="boundAudiences" className="inline-flex items-center gap-1.5">
                    Audiences
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircleIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <BashGlobPatternTooltip />
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="boundAudiences"
                    type="text"
                    placeholder="service1, service2"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <div className="flex flex-col gap-3">
              {boundClaimsFields.map(({ id }, index) => (
                <div className="flex items-start gap-2" key={id}>
                  <Controller
                    control={control}
                    name={`boundClaims.${index}.key`}
                    render={({ field, fieldState: { error } }) => (
                      <Field className="flex-1">
                        {index === 0 && (
                          <FieldLabel
                            htmlFor={`boundClaim-key-${index}`}
                            className="inline-flex items-center gap-1.5"
                          >
                            Claims
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircleIcon className="size-3.5 text-muted" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <BashGlobPatternTooltip />
                              </TooltipContent>
                            </Tooltip>
                          </FieldLabel>
                        )}
                        <Input
                          id={`boundClaim-key-${index}`}
                          value={field.value}
                          onChange={(e) => field.onChange(e)}
                          placeholder="property"
                          isError={Boolean(error)}
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name={`boundClaims.${index}.value`}
                    render={({ field, fieldState: { error } }) => (
                      <Field className="flex-1">
                        {index === 0 && (
                          <FieldLabel htmlFor={`boundClaim-value-${index}`} className="invisible">
                            Value
                          </FieldLabel>
                        )}
                        <Input
                          id={`boundClaim-value-${index}`}
                          value={field.value}
                          onChange={(e) => field.onChange(e)}
                          placeholder="value1, value2"
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
                    aria-label="Remove claim"
                    className={index === 0 ? "mt-[1.625rem]" : "mt-0.5"}
                    onClick={() => removeBoundClaimField(index)}
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
                onClick={() =>
                  appendBoundClaimField({
                    key: "",
                    value: ""
                  })
                }
              >
                <PlusIcon />
                Add Claims
              </Button>
            </div>

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
            <Controller
              control={control}
              name="caCert"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="caCert">CA Certificate</FieldLabel>
                  <TextArea
                    {...field}
                    id="caCert"
                    placeholder="-----BEGIN CERTIFICATE----- ..."
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            <div className="flex flex-col gap-3">
              {claimMetadataMappingFields.map(({ id }, index) => (
                <div className="flex items-start gap-2" key={id}>
                  <Controller
                    control={control}
                    name={`claimMetadataMapping.${index}.key`}
                    render={({ field, fieldState: { error } }) => (
                      <Field className="flex-1">
                        {index === 0 && (
                          <FieldLabel
                            htmlFor={`claimMetadata-key-${index}`}
                            className="inline-flex items-center gap-1.5"
                          >
                            Token Claim Mapping
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircleIcon className="size-3.5 text-muted" />
                              </TooltipTrigger>
                              <TooltipContent className="text-center">
                                <div className="w-[180px]">
                                  <p>Map OIDC token claims to metadata fields</p>
                                  <p className="mt-2 text-sm">Example:</p>
                                  <p className="mt-1 text-sm">
                                    &apos;role&apos; → &apos;token.groups&apos;
                                  </p>
                                  <p className="mt-1 text-xs text-muted">
                                    Becomes: identity.metadata.oidc.claims.role
                                  </p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </FieldLabel>
                        )}
                        <Input
                          id={`claimMetadata-key-${index}`}
                          value={field.value}
                          onChange={(e) => field.onChange(e)}
                          placeholder="Field name"
                          isError={Boolean(error)}
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name={`claimMetadataMapping.${index}.value`}
                    render={({ field, fieldState: { error } }) => (
                      <Field className="flex-1">
                        {index === 0 && (
                          <FieldLabel
                            htmlFor={`claimMetadata-value-${index}`}
                            className="invisible"
                          >
                            Value
                          </FieldLabel>
                        )}
                        <Input
                          id={`claimMetadata-value-${index}`}
                          value={field.value}
                          onChange={(e) => field.onChange(e)}
                          placeholder="Token claim"
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
                    aria-label="Remove claim mapping"
                    className={index === 0 ? "mt-[1.625rem]" : "mt-0.5"}
                    onClick={() => removeClaimMetadataMappingField(index)}
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
                onClick={() =>
                  appendClaimMetadataMappingField({
                    key: "",
                    value: ""
                  })
                }
              >
                <PlusIcon />
                Add Token Mapping
              </Button>
            </div>

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
