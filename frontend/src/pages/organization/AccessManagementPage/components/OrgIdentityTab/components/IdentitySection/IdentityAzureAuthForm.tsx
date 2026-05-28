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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useSubscription } from "@app/context";
import { SECONDS_PER_DAY } from "@app/helpers/datetime";
import { accessTokenTtlSchema } from "@app/helpers/identityAuthSchemas";
import { useScopeVariant } from "@app/hooks";
import {
  useAddIdentityAzureAuth,
  useGetIdentityAzureAuth,
  useUpdateIdentityAzureAuth
} from "@app/hooks/api";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IDENTITY_AUTH_FORM_ID, IdentityFormTab } from "./types";

const buildSchema = (maxAccessTokenTTL: number) =>
  z
    .object({
      tenantId: z.string().min(1),
      resource: z.string(),
      allowedServicePrincipalIds: z.string(),
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
    })
    .required();

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

export const IdentityAzureAuthForm = ({
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
  const { mutateAsync: addMutateAsync } = useAddIdentityAzureAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityAzureAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data } = useGetIdentityAzureAuth(identityId ?? "", {
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
      tenantId: "",
      resource: "https://management.azure.com/",
      allowedServicePrincipalIds: "",
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
        tenantId: data.tenantId,
        resource: data.resource,
        allowedServicePrincipalIds: data.allowedServicePrincipalIds,
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
        tenantId: "",
        resource: "https://management.azure.com/",
        allowedServicePrincipalIds: "",
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
    tenantId,
    resource,
    allowedServicePrincipalIds,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps
  }: FormData) => {
    if (!identityId) return;

    if (data) {
      await updateMutateAsync({
        ...(projectId ? { projectId } : { organizationId: orgId }),
        identityId,
        tenantId,
        resource,
        allowedServicePrincipalIds,
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit || "0"),
        accessTokenTrustedIps
      });
    } else {
      await addMutateAsync({
        ...(projectId ? { projectId } : { organizationId: orgId }),
        identityId,
        tenantId: tenantId || "",
        resource: resource || "",
        allowedServicePrincipalIds: allowedServicePrincipalIds || "",
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
              defaultValue="2592000"
              name="tenantId"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="tenantId">Tenant ID</FieldLabel>
                  <Input
                    {...field}
                    id="tenantId"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    type="text"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="resource"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="resource">Resource / Audience</FieldLabel>
                  <Input
                    {...field}
                    id="resource"
                    placeholder="https://management.azure.com/"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="allowedServicePrincipalIds"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="allowedServicePrincipalIds">
                    Allowed Service Principal IDs
                  </FieldLabel>
                  <Input
                    {...field}
                    id="allowedServicePrincipalIds"
                    placeholder="00000000-0000-0000-0000-000000000000, ..."
                    isError={Boolean(error)}
                  />
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
