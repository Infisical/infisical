import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton, Input, TextArea, Tooltip } from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import { useAddIdentityOidcAuth, useUpdateIdentityOidcAuth } from "@app/hooks/api";
import { IdentityAuthMethod } from "@app/hooks/api/identities";
import { useGetIdentityOidcAuth } from "@app/hooks/api/identities/queries";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
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
  oidcDiscoveryUrl: z.string().url().min(1),
  caCert: z.string().trim().default(""),
  boundIssuer: z.string().min(1),
  boundAudiences: z.string().optional().default(""),
  boundClaims: z.array(
    z.object({
      key: z.string(),
      value: z.string()
    })
  ),
  boundSubject: z.string().optional().default("")
});

export type FormData = z.infer<typeof schema>;

type Props = {
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityAuthMethod", "revokeAuthMethod"]>,
    state?: boolean
  ) => void;
  identityAuthMethodData: {
    identityId: string;
    name: string;
    configuredAuthMethods?: IdentityAuthMethod[];
    authMethod?: IdentityAuthMethod;
  };
};

export const IdentityOidcAuthForm = ({
  handlePopUpOpen,
  handlePopUpToggle,
  identityAuthMethodData
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();

  const { mutateAsync: addMutateAsync } = useAddIdentityOidcAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityOidcAuth();

  const isUpdate = identityAuthMethodData?.configuredAuthMethods?.includes(
    identityAuthMethodData.authMethod! || ""
  );
  const { data } = useGetIdentityOidcAuth(identityAuthMethodData?.identityId ?? "", {
    enabled: isUpdate
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "0",
      accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
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
    fields: accessTokenTrustedIpsFields,
    append: appendAccessTokenTrustedIp,
    remove: removeAccessTokenTrustedIp
  } = useFieldArray({ control, name: "accessTokenTrustedIps" });

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
        oidcDiscoveryUrl: "",
        caCert: "",
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
    oidcDiscoveryUrl,
    caCert,
    boundIssuer,
    boundAudiences,
    boundClaims,
    boundSubject
  }: FormData) => {
    try {
      if (!identityAuthMethodData) {
        return;
      }

      if (data) {
        await updateMutateAsync({
          identityId: identityAuthMethodData.identityId,
          organizationId: orgId,
          oidcDiscoveryUrl,
          caCert,
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
          identityId: identityAuthMethodData.identityId,
          oidcDiscoveryUrl,
          caCert,
          boundIssuer,
          boundAudiences,
          boundClaims: Object.fromEntries(boundClaims.map((entry) => [entry.key, entry.value])),
          boundSubject,
          organizationId: orgId,
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
    } catch (err) {
      createNotification({
        text: `Failed to ${isUpdate ? "update" : "configure"} identity`,
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="oidcDiscoveryUrl"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            isRequired
            label="OIDC Discovery URL"
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input
              {...field}
              placeholder="https://token.actions.githubusercontent.com"
              type="text"
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="boundIssuer"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            isRequired
            label="Issuer"
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input
              {...field}
              type="text"
              placeholder="https://token.actions.githubusercontent.com"
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="caCert"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="CA Certificate" errorText={error?.message} isError={Boolean(error)}>
            <TextArea {...field} placeholder="-----BEGIN CERTIFICATE----- ..." />
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
                  className="mb-0 flex-grow"
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
                  className="mb-0 flex-grow"
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
            <Input {...field} placeholder="2592000" type="number" min="1" step="1" />
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
            <Input {...field} placeholder="2592000" type="number" min="1" step="1" />
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
      {accessTokenTrustedIpsFields.map(({ id }, index) => (
        <div className="mb-3 flex items-end space-x-2" key={id}>
          <Controller
            control={control}
            name={`accessTokenTrustedIps.${index}.ipAddress`}
            defaultValue="0.0.0.0/0"
            render={({ field, fieldState: { error } }) => {
              return (
                <FormControl
                  className="mb-0 flex-grow"
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

                      handlePopUpOpen("upgradePlan");
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

              handlePopUpOpen("upgradePlan");
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

            handlePopUpOpen("upgradePlan");
          }}
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          size="xs"
        >
          Add IP Address
        </Button>
      </div>
      <div className="flex justify-between">
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
        {isUpdate && (
          <Button
            size="sm"
            colorSchema="danger"
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
            onClick={() => handlePopUpToggle("revokeAuthMethod", true)}
          >
            Remove Auth Method
          </Button>
        )}
      </div>
    </form>
  );
};
