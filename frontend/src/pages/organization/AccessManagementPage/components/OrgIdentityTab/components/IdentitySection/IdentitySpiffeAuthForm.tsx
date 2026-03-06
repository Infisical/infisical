import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextArea
} from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import { useAddIdentitySpiffeAuth, useUpdateIdentitySpiffeAuth } from "@app/hooks/api";
import {
  IdentitySpiffeConfigurationType,
  SpiffeBundleEndpointProfile
} from "@app/hooks/api/identities/enums";
import { useGetIdentitySpiffeAuth } from "@app/hooks/api/identities/queries";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityFormTab } from "./types";

const commonSchema = z.object({
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
  accessTokenTTL: z.string().refine((val) => Number(val) <= 315360000, {
    message: "Access Token TTL cannot be greater than 315360000"
  }),
  accessTokenMaxTTL: z.string().refine((val) => Number(val) <= 315360000, {
    message: "Access Token Max TTL cannot be greater than 315360000"
  }),
  accessTokenNumUsesLimit: z.string()
});

const schema = z.discriminatedUnion("configurationType", [
  z
    .object({
      configurationType: z.literal(IdentitySpiffeConfigurationType.STATIC),
      caBundleJwks: z.string().trim().min(1, "CA Bundle JWKS is required for static configuration"),
      bundleEndpointUrl: z.string().trim().optional().default(""),
      bundleEndpointProfile: z
        .nativeEnum(SpiffeBundleEndpointProfile)
        .optional()
        .default(SpiffeBundleEndpointProfile.HTTPS_WEB),
      bundleEndpointCaCert: z.string().trim().optional().default(""),
      bundleRefreshHintSeconds: z.string().optional().default("300")
    })
    .merge(commonSchema),
  z
    .object({
      configurationType: z.literal(IdentitySpiffeConfigurationType.REMOTE),
      caBundleJwks: z.string().trim().optional().default(""),
      bundleEndpointUrl: z.string().trim().url("Must be a valid URL"),
      bundleEndpointProfile: z
        .nativeEnum(SpiffeBundleEndpointProfile)
        .default(SpiffeBundleEndpointProfile.HTTPS_WEB),
      bundleEndpointCaCert: z.string().trim().optional().default(""),
      bundleRefreshHintSeconds: z.string().default("300")
    })
    .merge(commonSchema)
]);

export type FormData = z.infer<typeof schema>;

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
};

export const IdentitySpiffeAuthForm = ({
  handlePopUpOpen,
  handlePopUpToggle,
  identityId,
  isUpdate
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();
  const { projectId } = useParams({
    strict: false
  });
  const { mutateAsync: addMutateAsync } = useAddIdentitySpiffeAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentitySpiffeAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data } = useGetIdentitySpiffeAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const {
    watch,
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      configurationType: IdentitySpiffeConfigurationType.STATIC,
      trustDomain: "",
      allowedSpiffeIds: "",
      allowedAudiences: "",
      caBundleJwks: "",
      bundleEndpointUrl: "",
      bundleEndpointProfile: SpiffeBundleEndpointProfile.HTTPS_WEB,
      bundleEndpointCaCert: "",
      bundleRefreshHintSeconds: "300",
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "0",
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
    }
  });

  const selectedConfigurationType = watch("configurationType") as IdentitySpiffeConfigurationType;
  const selectedBundleEndpointProfile = watch("bundleEndpointProfile");

  const {
    fields: accessTokenTrustedIpsFields,
    append: appendAccessTokenTrustedIp,
    remove: removeAccessTokenTrustedIp
  } = useFieldArray({ control, name: "accessTokenTrustedIps" });

  useEffect(() => {
    if (data) {
      reset({
        configurationType:
          (data.configurationType as IdentitySpiffeConfigurationType) ||
          IdentitySpiffeConfigurationType.STATIC,
        trustDomain: data.trustDomain,
        allowedSpiffeIds: data.allowedSpiffeIds,
        allowedAudiences: data.allowedAudiences,
        caBundleJwks: data.caBundleJwks || "",
        bundleEndpointUrl: data.bundleEndpointUrl || "",
        bundleEndpointProfile:
          (data.bundleEndpointProfile as SpiffeBundleEndpointProfile) ||
          SpiffeBundleEndpointProfile.HTTPS_WEB,
        bundleEndpointCaCert: data.bundleEndpointCaCert || "",
        bundleRefreshHintSeconds: String(data.bundleRefreshHintSeconds ?? 300),
        accessTokenTTL: String(data.accessTokenTTL),
        accessTokenMaxTTL: String(data.accessTokenMaxTTL),
        accessTokenNumUsesLimit: String(data.accessTokenNumUsesLimit),
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

  const onFormSubmit = async ({
    accessTokenTrustedIps,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    configurationType,
    trustDomain,
    allowedSpiffeIds,
    allowedAudiences,
    caBundleJwks,
    bundleEndpointUrl,
    bundleEndpointProfile,
    bundleEndpointCaCert,
    bundleRefreshHintSeconds
  }: FormData) => {
    if (!identityId) {
      return;
    }

    if (data) {
      await updateMutateAsync({
        identityId,
        ...(projectId ? { projectId } : { organizationId: orgId }),
        configurationType,
        trustDomain,
        allowedSpiffeIds,
        allowedAudiences,
        caBundleJwks,
        bundleEndpointUrl,
        bundleEndpointProfile,
        bundleEndpointCaCert,
        bundleRefreshHintSeconds: Number(bundleRefreshHintSeconds),
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
        accessTokenTrustedIps
      });
    } else {
      await addMutateAsync({
        identityId,
        configurationType,
        trustDomain,
        allowedSpiffeIds,
        allowedAudiences,
        caBundleJwks,
        bundleEndpointUrl,
        bundleEndpointProfile,
        bundleEndpointCaCert,
        bundleRefreshHintSeconds: Number(bundleRefreshHintSeconds),
        ...(projectId ? { projectId } : { organizationId: orgId }),
        accessTokenTTL: Number(accessTokenTTL),
        accessTokenMaxTTL: Number(accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
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
      onSubmit={handleSubmit(onFormSubmit, (fields) => {
        setTabValue(
          ["accessTokenTrustedIps"].includes(Object.keys(fields)[0])
            ? IdentityFormTab.Advanced
            : IdentityFormTab.Configuration
        );
      })}
    >
      <Tabs value={tabValue} onValueChange={(value) => setTabValue(value as IdentityFormTab)}>
        <TabList>
          <Tab value={IdentityFormTab.Configuration}>Configuration</Tab>
          <Tab value={IdentityFormTab.Advanced}>Advanced</Tab>
        </TabList>
        <TabPanel value={IdentityFormTab.Configuration}>
          <Controller
            control={control}
            name="configurationType"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Configuration Type"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => {
                    onChange(e);
                  }}
                  className="w-full"
                >
                  <SelectItem value={IdentitySpiffeConfigurationType.STATIC} key="static">
                    Static
                  </SelectItem>
                  <SelectItem value={IdentitySpiffeConfigurationType.REMOTE} key="remote">
                    Remote
                  </SelectItem>
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="trustDomain"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                isRequired
                label="Trust Domain"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} type="text" placeholder="example.org" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="allowedSpiffeIds"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                isRequired
                label="Allowed SPIFFE IDs"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <TextArea
                  {...field}
                  placeholder="Comma-separated picomatch patterns (e.g. spiffe://example.org/ns/*/sa/*)"
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="allowedAudiences"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                isRequired
                label="Allowed Audiences"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} type="text" placeholder="Comma-separated (e.g. aud1, aud2)" />
              </FormControl>
            )}
          />
          {selectedConfigurationType === IdentitySpiffeConfigurationType.STATIC && (
            <Controller
              control={control}
              name="caBundleJwks"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  isRequired
                  label="CA Bundle JWKS"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <TextArea {...field} placeholder="Paste SPIRE JWKS JSON" />
                </FormControl>
              )}
            />
          )}
          {selectedConfigurationType === IdentitySpiffeConfigurationType.REMOTE && (
            <>
              <Controller
                control={control}
                name="bundleEndpointUrl"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isRequired
                    label="Bundle Endpoint URL"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input
                      {...field}
                      type="text"
                      placeholder="https://spire-server:8443"
                    />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="bundleEndpointProfile"
                render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                  <FormControl
                    label="Bundle Endpoint Profile"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Select
                      defaultValue={field.value}
                      {...field}
                      onValueChange={(e) => {
                        onChange(e);
                      }}
                      className="w-full"
                    >
                      <SelectItem
                        value={SpiffeBundleEndpointProfile.HTTPS_WEB}
                        key="https_web"
                      >
                        HTTPS Web
                      </SelectItem>
                      <SelectItem
                        value={SpiffeBundleEndpointProfile.HTTPS_SPIFFE}
                        key="https_spiffe"
                      >
                        HTTPS SPIFFE
                      </SelectItem>
                    </Select>
                  </FormControl>
                )}
              />
              {selectedBundleEndpointProfile === SpiffeBundleEndpointProfile.HTTPS_SPIFFE && (
                <Controller
                  control={control}
                  name="bundleEndpointCaCert"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Bundle Endpoint CA Certificate"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <TextArea {...field} placeholder="-----BEGIN CERTIFICATE----- ..." />
                    </FormControl>
                  )}
                />
              )}
              <Controller
                control={control}
                name="bundleRefreshHintSeconds"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Bundle Refresh Hint (seconds)"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="300" type="number" min="0" step="1" />
                  </FormControl>
                )}
              />
            </>
          )}
          <Controller
            control={control}
            defaultValue="2592000"
            name="accessTokenTTL"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Access Token TTL (seconds)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="2592000" type="number" min="0" step="1" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue="2592000"
            name="accessTokenMaxTTL"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Access Token Max TTL (seconds)"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="2592000" type="number" min="0" step="1" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue="0"
            name="accessTokenNumUsesLimit"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Access Token Max Number of Uses"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="0" type="number" min="0" step="1" />
              </FormControl>
            )}
          />
        </TabPanel>
        <TabPanel value={IdentityFormTab.Advanced}>
          {accessTokenTrustedIpsFields.map(({ id }, index) => (
            <div className="mb-3 flex items-end space-x-2" key={id}>
              <Controller
                control={control}
                name={`accessTokenTrustedIps.${index}.ipAddress`}
                defaultValue="0.0.0.0/0"
                render={({ field, fieldState: { error } }) => {
                  return (
                    <FormControl
                      className="mb-0 grow"
                      label={index === 0 ? "Access Token Trusted IPs" : undefined}
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
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
                      />
                    </FormControl>
                  );
                }}
              />
              <IconButton
                onClick={() => {
                  if (subscription?.ipAllowlisting) {
                    removeAccessTokenTrustedIp(index);
                    return;
                  }

                  handlePopUpOpen("upgradePlan", {
                    featureName: "IP allowlisting"
                  });
                }}
                size="lg"
                colorSchema="danger"
                variant="plain"
                ariaLabel="update"
                className="p-3"
              >
                <FontAwesomeIcon icon={faXmark} />
              </IconButton>
            </div>
          ))}
          <div className="my-4 ml-1">
            <Button
              variant="outline_bg"
              onClick={() => {
                if (subscription?.ipAllowlisting) {
                  appendAccessTokenTrustedIp({
                    ipAddress: "0.0.0.0/0"
                  });
                  return;
                }

                handlePopUpOpen("upgradePlan", {
                  featureName: "IP allowlisting"
                });
              }}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              size="xs"
            >
              Add IP Address
            </Button>
          </div>
        </TabPanel>
      </Tabs>
      <div className="flex items-center">
        <Button
          className="mr-4"
          size="sm"
          type="submit"
          isLoading={isSubmitting}
          isDisabled={isSubmitting}
        >
          {isUpdate ? "Update" : "Create"}
        </Button>

        <Button
          colorSchema="secondary"
          variant="plain"
          onClick={() => handlePopUpToggle("identityAuthMethod", false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};
