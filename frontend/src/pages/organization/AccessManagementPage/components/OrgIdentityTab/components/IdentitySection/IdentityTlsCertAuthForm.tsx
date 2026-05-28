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
import {
  useAddIdentityTlsCertAuth,
  useGetIdentityTlsCertAuth,
  useUpdateIdentityTlsCertAuth
} from "@app/hooks/api";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IDENTITY_AUTH_FORM_ID, IdentityFormTab } from "./types";

const buildSchema = (maxAccessTokenTTL: number) =>
  z.object({
    allowedCommonNames: z.string().optional(),
    caCertificate: z.string().min(1),
    accessTokenTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token TTL"),
    accessTokenMaxTTL: accessTokenTtlSchema(maxAccessTokenTTL, "Access Token Max TTL"),
    accessTokenNumUsesLimit: z.string(),
    accessTokenTrustedIps: z
      .array(
        z.object({
          ipAddress: z.string().max(50)
        })
      )
      .min(1)
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

export const IdentityTlsCertAuthForm = ({
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
  const { mutateAsync: addMutateAsync } = useAddIdentityTlsCertAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityTlsCertAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data } = useGetIdentityTlsCertAuth(identityId ?? "", {
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
      caCertificate: "",
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "",
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
    }
  });

  const {
    fields: accessTokenTrustedIpsFields,
    append: appendAccessTokenTrustedIp,
    remove: removeAccessTokenTrustedIp
  } = useFieldArray({ control, name: "accessTokenTrustedIps" });

  useEffect(() => {
    if (data) {
      reset({
        caCertificate: data.caCertificate,
        allowedCommonNames: data.allowedCommonNames || undefined,
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
    } else {
      reset({
        caCertificate: "",
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "",
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
      });
    }
  }, [data]);

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  const onFormSubmit = async ({
    caCertificate,
    allowedCommonNames,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps
  }: FormData) => {
    if (!identityId) return;

    if (data) {
      await updateMutateAsync({
        ...(projectId ? { projectId } : { organizationId: orgId }),
        caCertificate,
        allowedCommonNames: allowedCommonNames || null,
        identityId,
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit || "0"),
        accessTokenTrustedIps
      });
    } else {
      await addMutateAsync({
        ...(projectId ? { projectId } : { organizationId: orgId }),
        identityId,
        caCertificate,
        allowedCommonNames: allowedCommonNames || undefined,
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
    <form id={IDENTITY_AUTH_FORM_ID} onSubmit={handleSubmit(onFormSubmit)}>
      <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as IdentityFormTab)}>
        <TabsList variant={scopeVariant}>
          <TabsTrigger value={IdentityFormTab.Configuration}>Configuration</TabsTrigger>
          <TabsTrigger value={IdentityFormTab.Advanced}>Advanced</TabsTrigger>
        </TabsList>
        <TabsContent value={IdentityFormTab.Configuration}>
          <FieldGroup>
            <Controller
              control={control}
              name="caCertificate"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="caCertificate" className="inline-flex items-center gap-1.5">
                    CA Certificate
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent>
                        A PEM-encoded CA certificate. This will be used to validate client
                        certificate.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <TextArea
                    {...field}
                    id="caCertificate"
                    placeholder="-----BEGIN CERTIFICATE----- ..."
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />

            <Controller
              control={control}
              defaultValue=""
              name="allowedCommonNames"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel
                    htmlFor="allowedCommonNames"
                    className="inline-flex items-center gap-1.5"
                  >
                    Allowed Common Names (optional)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Comma separated common names allowed to authenticate against the identity.
                        Leave empty to allow any certificate.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input {...field} id="allowedCommonNames" type="text" isError={Boolean(error)} />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              defaultValue="2592000"
              name="accessTokenTTL"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="accessTokenTTL" className="inline-flex items-center gap-1.5">
                    Access Token TTL (seconds)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent>
                        The lifetime for an access token in seconds. This value will be referenced
                        at renewal time.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
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
                  <FieldLabel
                    htmlFor="accessTokenMaxTTL"
                    className="inline-flex items-center gap-1.5"
                  >
                    Access Token Max TTL (seconds)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="size-3.5 text-muted" />
                      </TooltipTrigger>
                      <TooltipContent>
                        The maximum lifetime for an access token in seconds. This value will be
                        referenced at renewal time.
                      </TooltipContent>
                    </Tooltip>
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
                          <FieldLabel
                            htmlFor={`trustedIp-${index}`}
                            className="inline-flex items-center gap-1.5"
                          >
                            Access Token Trusted IPs
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <InfoIcon className="size-3.5 text-muted" />
                              </TooltipTrigger>
                              <TooltipContent>
                                The IPs or CIDR ranges that access tokens can be used from. By
                                default, each token is given the 0.0.0.0/0, allowing usage from any
                                network address.
                              </TooltipContent>
                            </Tooltip>
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
