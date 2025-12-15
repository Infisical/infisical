import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
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
  TextArea,
  Tooltip
} from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import { useAddIdentityJwtAuth, useUpdateIdentityJwtAuth } from "@app/hooks/api";
import { IdentityJwtConfigurationType } from "@app/hooks/api/identities/enums";
import { useGetIdentityJwtAuth } from "@app/hooks/api/identities/queries";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityFormTab } from "./types";

const commonSchema = z.object({
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

const schema = z.discriminatedUnion("configurationType", [
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
    .merge(commonSchema),
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

export const IdentityJwtAuthForm = ({
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
  const { mutateAsync: addMutateAsync } = useAddIdentityJwtAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityJwtAuth();
  const [tabValue, setTabValue] = useState<IdentityFormTab>(IdentityFormTab.Configuration);

  const { data } = useGetIdentityJwtAuth(identityId ?? "", {
    enabled: isUpdate
  });

  const {
    watch,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "0",
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }],
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

  const {
    fields: accessTokenTrustedIpsFields,
    append: appendAccessTokenTrustedIp,
    remove: removeAccessTokenTrustedIp
  } = useFieldArray({ control, name: "accessTokenTrustedIps" });

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
        accessTokenNumUsesLimit: String(data.accessTokenNumUsesLimit),
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
        configurationType: IdentityJwtConfigurationType.JWKS,
        jwksUrl: "",
        jwksCaCert: "",
        boundIssuer: "",
        boundAudiences: "",
        boundClaims: [],
        boundSubject: "",
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "0",
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
      });
    }
  }, [data]);

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
        accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
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
                  className="w-full"
                >
                  <SelectItem value={IdentityJwtConfigurationType.JWKS} key="jwks">
                    JWKS
                  </SelectItem>
                  <SelectItem value={IdentityJwtConfigurationType.STATIC} key="static">
                    Static
                  </SelectItem>
                </Select>
              </FormControl>
            )}
          />
          {selectedConfigurationType === IdentityJwtConfigurationType.JWKS && (
            <>
              <Controller
                control={control}
                name="jwksUrl"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isRequired
                    label="JWKS URL"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} type="text" />
                  </FormControl>
                )}
              />
              <Controller
                control={control}
                name="jwksCaCert"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="JWKS CA Certificate"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <TextArea {...field} placeholder="-----BEGIN CERTIFICATE----- ..." />
                  </FormControl>
                )}
              />
            </>
          )}
          {selectedConfigurationType === IdentityJwtConfigurationType.STATIC && (
            <>
              {publicKeyFields.map(({ id }, index) => (
                <div key={id} className="flex gap-2">
                  <Controller
                    control={control}
                    name={`publicKeys.${index}.value`}
                    render={({ field, fieldState: { error } }) => (
                      <FormControl
                        className="grow"
                        label={`Public Key ${index + 1}`}
                        errorText={error?.message}
                        isError={Boolean(error)}
                        icon={
                          <Tooltip
                            className="text-center"
                            content={<span>This field only accepts PEM-formatted public keys</span>}
                          >
                            <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                          </Tooltip>
                        }
                      >
                        <TextArea {...field} placeholder="-----BEGIN PUBLIC KEY----- ..." />
                      </FormControl>
                    )}
                  />
                  <IconButton
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
                  onClick={() =>
                    appendPublicKeyFields({
                      value: ""
                    })
                  }
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  size="xs"
                >
                  Add Public Key
                </Button>
              </div>
            </>
          )}
          <Controller
            control={control}
            name="boundIssuer"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Issuer" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="boundSubject"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Subject"
                isError={Boolean(error)}
                errorText={error?.message}
                icon={
                  <Tooltip
                    className="text-center"
                    content={<span>This field supports glob patterns</span>}
                  >
                    <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                  </Tooltip>
                }
              >
                <Input {...field} type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="boundAudiences"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Audiences"
                isError={Boolean(error)}
                errorText={error?.message}
                icon={
                  <Tooltip
                    className="text-center"
                    content={<span>This field supports glob patterns</span>}
                  >
                    <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                  </Tooltip>
                }
              >
                <Input {...field} type="text" placeholder="service1, service2" />
              </FormControl>
            )}
          />
          {boundClaimsFields.map(({ id }, index) => (
            <div className="mb-3 flex items-end space-x-2" key={id}>
              <Controller
                control={control}
                name={`boundClaims.${index}.key`}
                render={({ field, fieldState: { error } }) => {
                  return (
                    <FormControl
                      className="mb-0 grow"
                      label={index === 0 ? "Claims" : undefined}
                      icon={
                        index === 0 ? (
                          <Tooltip
                            className="text-center"
                            content={<span>This field supports glob patterns</span>}
                          >
                            <FontAwesomeIcon icon={faQuestionCircle} size="sm" />
                          </Tooltip>
                        ) : undefined
                      }
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
                        value={field.value}
                        onChange={(e) => field.onChange(e)}
                        placeholder="property"
                      />
                    </FormControl>
                  );
                }}
              />
              <Controller
                control={control}
                name={`boundClaims.${index}.value`}
                render={({ field, fieldState: { error } }) => {
                  return (
                    <FormControl
                      className="mb-0 grow"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <Input
                        value={field.value}
                        onChange={(e) => field.onChange(e)}
                        placeholder="value1, value2"
                      />
                    </FormControl>
                  );
                }}
              />

              <IconButton
                onClick={() => removeBoundClaimField(index)}
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
              onClick={() =>
                appendBoundClaimField({
                  key: "",
                  value: ""
                })
              }
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              size="xs"
            >
              Add Claims
            </Button>
          </div>
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
                          if (
                            subscription?.get(
                              SubscriptionProductCategory.Platform,
                              "ipAllowlisting"
                            )
                          ) {
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
                  if (subscription?.get(SubscriptionProductCategory.Platform, "ipAllowlisting")) {
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
                if (subscription?.get(SubscriptionProductCategory.Platform, "ipAllowlisting")) {
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
