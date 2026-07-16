import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { HelpCircleIcon, PlusIcon, XIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { BashGlobPatternTooltip } from "@app/components/permissions";
import {
  Button,
  Field,
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
import {
  accessTokenTtlSchema,
  DEFAULT_TRUSTED_IPS,
  mapTrustedIpsFromServer,
  superRefineAccessTokenTtl,
  trustedIpsSchema
} from "@app/helpers/identityAuthSchemas";
import { useScopeVariant } from "@app/hooks";
import { useAddIdentityJwtAuth, useUpdateIdentityJwtAuth } from "@app/hooks/api";
import { IdentityJwtConfigurationType } from "@app/hooks/api/identities/enums";
import { useGetIdentityJwtAuth } from "@app/hooks/api/identities/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { AccessTokenNumUsesLimitField } from "./shared/AccessTokenNumUsesLimitField";
import { AccessTokenTtlFields } from "./shared/AccessTokenTtlFields";
import { TrustedIpsField } from "./shared/TrustedIpsField";
import { IDENTITY_AUTH_FORM_ID, IdentityFormTab } from "./types";

const buildSchema = (maxAccessTokenTTL: number) => {
  const common = z.object({
    accessTokenTrustedIps: trustedIpsSchema,
    accessTokenTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token TTL"),
    accessTokenMaxTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token Max TTL"),
    accessTokenNumUsesLimit: z.string(),
    boundIssuer: z.string().trim().default(""),
    boundAudiences: z.string().optional().default(""),
    boundClaims: z.array(
      z.object({
        key: z.string(),
        value: z.string()
      })
    ),
    boundSubject: z.string().optional().default("")
  });

  return z
    .discriminatedUnion("configurationType", [
      z
        .object({
          configurationType: z.literal(IdentityJwtConfigurationType.JWKS),
          jwksUrl: z.string().trim().url(),
          jwksCaCert: z.string().trim().default(""),
          publicKeys: z
            .object({
              value: z.string()
            })
            .array()
            .optional()
        })
        .merge(common),
      z
        .object({
          configurationType: z.literal(IdentityJwtConfigurationType.STATIC),
          jwksUrl: z.string().trim().optional(),
          jwksCaCert: z.string().trim().optional().default(""),
          publicKeys: z
            .object({
              value: z.string().min(1)
            })
            .array()
            .min(1)
        })
        .merge(common)
    ])
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

export const IdentityJwtAuthForm = ({
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
  const { mutateAsync: addMutateAsync } = useAddIdentityJwtAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityJwtAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data } = useGetIdentityJwtAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const resolver = useMemo(() => zodResolver(buildSchema(maxAccessTokenTTL)), [maxAccessTokenTTL]);

  const {
    watch,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver,
    defaultValues: {
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "",
      accessTokenTrustedIps: DEFAULT_TRUSTED_IPS,
      configurationType: IdentityJwtConfigurationType.JWKS
    }
  });

  const selectedConfigurationType = watch("configurationType") as IdentityJwtConfigurationType;

  const {
    fields: publicKeyFields,
    append: appendPublicKeyFields,
    remove: removePublicKeyFields
  } = useFieldArray({
    control,
    name: "publicKeys"
  });

  const {
    fields: boundClaimsFields,
    append: appendBoundClaimField,
    remove: removeBoundClaimField
  } = useFieldArray({
    control,
    name: "boundClaims"
  });

  useEffect(() => {
    if (data) {
      reset({
        configurationType: data.configurationType,
        jwksUrl: data.jwksUrl,
        jwksCaCert: data.jwksCaCert,
        publicKeys: data.publicKeys.map((pk) => ({
          value: pk
        })),
        boundIssuer: data.boundIssuer,
        boundAudiences: data.boundAudiences,
        boundClaims: Object.entries(data.boundClaims).map(([key, value]) => ({
          key,
          value
        })),
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
        configurationType: IdentityJwtConfigurationType.JWKS,
        jwksUrl: "",
        jwksCaCert: "",
        boundIssuer: "",
        boundAudiences: "",
        boundClaims: [],
        boundSubject: "",
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "",
        accessTokenTrustedIps: DEFAULT_TRUSTED_IPS
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
    configurationType,
    jwksUrl,
    jwksCaCert,
    publicKeys,
    boundIssuer,
    boundAudiences,
    boundClaims,
    boundSubject
  }: FormData) => {
    if (!identityId) {
      return;
    }

    if (data) {
      await updateMutateAsync({
        identityId,
        ...(projectId ? { projectId } : { organizationId: orgId }),
        configurationType,
        jwksUrl,
        jwksCaCert,
        publicKeys: publicKeys?.map((field) => field.value).filter(Boolean),
        boundIssuer,
        boundAudiences,
        boundClaims: Object.fromEntries(boundClaims.map((entry) => [entry.key, entry.value])),
        boundSubject,
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit || "0"),
        accessTokenTrustedIps
      });
    } else {
      await addMutateAsync({
        identityId,
        configurationType,
        jwksUrl,
        jwksCaCert,
        publicKeys: publicKeys?.map((field) => field.value).filter(Boolean),
        boundIssuer,
        boundAudiences,
        boundClaims: Object.fromEntries(boundClaims.map((entry) => [entry.key, entry.value])),
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
              name="configurationType"
              render={({ field: { onChange, value }, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="configurationType">Configuration Type</FieldLabel>
                  <Select
                    value={value}
                    onValueChange={(e) => {
                      if (e === IdentityJwtConfigurationType.JWKS) {
                        setValue("publicKeys", []);
                      } else {
                        setValue("publicKeys", [
                          {
                            value: ""
                          }
                        ]);
                        setValue("jwksUrl", "");
                        setValue("jwksCaCert", "");
                      }
                      onChange(e);
                    }}
                  >
                    <SelectTrigger
                      id="configurationType"
                      className="w-full"
                      isError={Boolean(error)}
                    >
                      <SelectValue placeholder="Select configuration type" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value={IdentityJwtConfigurationType.JWKS} key="jwks">
                        JWKS
                      </SelectItem>
                      <SelectItem value={IdentityJwtConfigurationType.STATIC} key="static">
                        Static
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            {selectedConfigurationType === IdentityJwtConfigurationType.JWKS && (
              <>
                <Controller
                  control={control}
                  name="jwksUrl"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="jwksUrl">JWKS URL</FieldLabel>
                      <Input {...field} id="jwksUrl" type="text" isError={Boolean(error)} />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="jwksCaCert"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="jwksCaCert">JWKS CA Certificate (optional)</FieldLabel>
                      <TextArea
                        {...field}
                        id="jwksCaCert"
                        placeholder="-----BEGIN CERTIFICATE----- ..."
                        isError={Boolean(error)}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </>
            )}
            {selectedConfigurationType === IdentityJwtConfigurationType.STATIC && (
              <div className="flex flex-col gap-3">
                {publicKeyFields.map(({ id }, index) => (
                  <div key={id} className="flex items-start gap-2">
                    <Controller
                      control={control}
                      name={`publicKeys.${index}.value`}
                      render={({ field, fieldState: { error } }) => (
                        <Field className="flex-1">
                          <FieldLabel
                            htmlFor={`publicKey-${index}`}
                            className="inline-flex items-center gap-1.5"
                          >
                            Public Key {index + 1}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircleIcon className="size-3.5 text-muted" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md text-center">
                                This field only accepts PEM-formatted public keys
                              </TooltipContent>
                            </Tooltip>
                          </FieldLabel>
                          <TextArea
                            {...field}
                            id={`publicKey-${index}`}
                            placeholder="-----BEGIN PUBLIC KEY----- ..."
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
                      aria-label="Remove public key"
                      className="mt-[1.625rem]"
                      onClick={() => {
                        if (publicKeyFields.length === 1) {
                          createNotification({
                            type: "error",
                            text: "A public key is required for static configurations"
                          });
                          return;
                        }
                        removePublicKeyFields(index);
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
                  onClick={() =>
                    appendPublicKeyFields({
                      value: ""
                    })
                  }
                >
                  <PlusIcon />
                  Add Public Key
                </Button>
              </div>
            )}
            <Controller
              control={control}
              name="boundIssuer"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="boundIssuer">Issuer</FieldLabel>
                  <Input {...field} id="boundIssuer" type="text" isError={Boolean(error)} />
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
                    Subject (optional)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircleIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
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
                    Audiences (optional)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircleIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
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
                              <TooltipContent className="max-w-md">
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
