import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
  FormControl,
  IconButton,
  Input,
  TextArea
} from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import {
  useAddIdentityKubernetesAuth,
  useGetIdentityKubernetesAuth,
  useUpdateIdentityKubernetesAuth
} from "@app/hooks/api";
import { IdentityAuthMethod } from "@app/hooks/api/identities";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { usePopUp, UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    kubernetesHost: z.string().min(1),
    tokenReviewerJwt: z.string().min(1),
    allowedNames: z.string(),
    allowedNamespaces: z.string(),
    allowedAudience: z.string(),
    caCert: z.string(),
    accessTokenTTL: z.string().refine((val) => Number(val) <= 315360000, {
      message: "Access Token TTL cannot be greater than 315360000"
    }),
    accessTokenMaxTTL: z.string().refine((val) => Number(val) <= 315360000, {
      message: "Access Token Max TTL cannot be greater than 315360000"
    }),
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
    authMethod?: IdentityAuthMethod;
  };
  initialAuthMethod: IdentityAuthMethod;
  revokeAuth: (authMethod: IdentityAuthMethod) => Promise<void>;
};

export const IdentityKubernetesAuthForm = ({
  handlePopUpOpen,
  handlePopUpToggle,
  identityAuthMethodData,
  initialAuthMethod,
  revokeAuth
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();

  const { mutateAsync: addMutateAsync } = useAddIdentityKubernetesAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityKubernetesAuth();

  const isCurrentAuthMethod = identityAuthMethodData?.authMethod === initialAuthMethod;
  const { data } = useGetIdentityKubernetesAuth(identityAuthMethodData?.identityId ?? "", {
    enabled: isCurrentAuthMethod
  });
  const internalPopUpState = usePopUp(["overwriteAuthMethod"] as const);

  const {
    control,
    handleSubmit,
    reset,
    trigger,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      kubernetesHost: "",
      tokenReviewerJwt: "",
      allowedNames: "",
      allowedNamespaces: "",
      allowedAudience: "",
      caCert: "",
      accessTokenTTL: "2592000",
      accessTokenMaxTTL: "2592000",
      accessTokenNumUsesLimit: "0",
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
        kubernetesHost: data.kubernetesHost,
        tokenReviewerJwt: data.tokenReviewerJwt,
        allowedNames: data.allowedNames,
        allowedNamespaces: data.allowedNamespaces,
        allowedAudience: data.allowedAudience,
        caCert: data.caCert,
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
        kubernetesHost: "",
        tokenReviewerJwt: "",
        allowedNames: "",
        allowedNamespaces: "",
        allowedAudience: "",
        caCert: "",
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "0",
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
      });
    }
  }, [data]);

  const onFormSubmit = async ({
    kubernetesHost,
    tokenReviewerJwt,
    allowedNames,
    allowedNamespaces,
    allowedAudience,
    caCert,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps
  }: FormData) => {
    try {
      if (!identityAuthMethodData) return;

      if (data) {
        await updateMutateAsync({
          organizationId: orgId,
          kubernetesHost,
          tokenReviewerJwt,
          allowedNames,
          allowedNamespaces,
          allowedAudience,
          caCert,
          identityId: identityAuthMethodData.identityId,
          accessTokenTTL: Number(accessTokenTTL),
          accessTokenMaxTTL: Number(accessTokenMaxTTL),
          accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
          accessTokenTrustedIps
        });
      } else {
        await addMutateAsync({
          organizationId: orgId,
          identityId: identityAuthMethodData.identityId,
          kubernetesHost: kubernetesHost || "",
          tokenReviewerJwt,
          allowedNames: allowedNames || "",
          allowedNamespaces: allowedNamespaces || "",
          allowedAudience: allowedAudience || "",
          caCert: caCert || "",
          accessTokenTTL: Number(accessTokenTTL),
          accessTokenMaxTTL: Number(accessTokenMaxTTL),
          accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
          accessTokenTrustedIps
        });
      }

      handlePopUpToggle("identityAuthMethod", false);

      createNotification({
        text: `Successfully ${isCurrentAuthMethod ? "updated" : "configured"} auth method`,
        type: "success"
      });

      reset();
    } catch (err) {
      createNotification({
        text: `Failed to ${identityAuthMethodData?.authMethod ? "update" : "configure"} identity`,
        type: "error"
      });
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <Controller
          control={control}
          defaultValue="2592000"
          name="kubernetesHost"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Kubernetes Host / Base Kubernetes API URL "
              isError={Boolean(error)}
              errorText={error?.message}
              tooltipText="The host string, host:port pair, or URL to the base of the Kubernetes API server. This can usually be obtained by running 'kubectl cluster-info'"
              isRequired
            >
              <Input {...field} placeholder="https://my-example-k8s-api-host.com" type="text" />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="tokenReviewerJwt"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Token Reviewer JWT"
              isError={Boolean(error)}
              errorText={error?.message}
              tooltipText="A long-lived service account JWT token for Infisical to access the TokenReview API to validate other service account JWT tokens submitted by applications/pods."
              isRequired
            >
              <Input {...field} placeholder="" type="password" />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="allowedNames"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Allowed Service Account Names"
              isError={Boolean(error)}
              tooltipText="An optional comma-separated list of trusted service account names that are allowed to authenticate with Infisical. Leave empty to allow any service account."
              errorText={error?.message}
            >
              <Input {...field} placeholder="service-account-1-name, service-account-1-name" />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          defaultValue=""
          name="allowedNamespaces"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Allowed Namespaces"
              isError={Boolean(error)}
              errorText={error?.message}
              tooltipText="An optional comma-separated list of trusted service account names that are allowed to authenticate with Infisical. Leave empty to allow any namespaces."
            >
              <Input {...field} placeholder="namespaceA, namespaceB" type="text" />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          defaultValue=""
          name="allowedAudience"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Allowed Audience"
              isError={Boolean(error)}
              errorText={error?.message}
              tooltipText="An optional audience claim that the service account JWT token must have to authenticate with Infisical. Leave empty to allow any audience claim."
            >
              <Input {...field} placeholder="" type="text" />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="caCert"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="CA Certificate"
              errorText={error?.message}
              isError={Boolean(error)}
              tooltipText="An optional PEM-encoded CA cert for the Kubernetes API server. This is used by the TLS client for secure communication with the Kubernetes API server."
            >
              <TextArea {...field} placeholder="-----BEGIN CERTIFICATE----- ..." />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          defaultValue="2592000"
          name="accessTokenTTL"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Access Token TTL (seconds)"
              tooltipText="The lifetime for an acccess token in seconds. This value will be referenced at renewal time."
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
              tooltipText="The maximum lifetime for an access token in seconds. This value will be referenced at renewal time."
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
              tooltipText="The maximum number of times that an access token can be used; a value of 0 implies infinite number of uses."
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
                    tooltipText="The IPs or CIDR ranges that access tokens can be used from. By default, each token is given the 0.0.0.0/0, allowing usage from any network address."
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
            {initialAuthMethod && identityAuthMethodData?.authMethod !== initialAuthMethod ? (
              <Button
                className="mr-4"
                size="sm"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
                onClick={() => internalPopUpState.handlePopUpToggle("overwriteAuthMethod", true)}
              >
                Overwrite
              </Button>
            ) : (
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                Submit
              </Button>
            )}
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("identityAuthMethod", false)}
            >
              Cancel
            </Button>
          </div>
          {isCurrentAuthMethod && (
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
      <DeleteActionModal
        isOpen={internalPopUpState.popUp.overwriteAuthMethod?.isOpen}
        title={`Are you sure want to overwrite ${initialAuthMethod || "the auth method"} on ${
          identityAuthMethodData?.name ?? ""
        }?`}
        onChange={(isOpen) => internalPopUpState.handlePopUpToggle("overwriteAuthMethod", isOpen)}
        deleteKey="confirm"
        buttonText="Overwrite"
        onDeleteApproved={async () => {
          const result = await trigger();
          if (result) {
            await revokeAuth(initialAuthMethod);
            handleSubmit(onFormSubmit)();
          } else {
            createNotification({
              text: "Please fill in all required fields",
              type: "error"
            });
            internalPopUpState.handlePopUpToggle("overwriteAuthMethod", false);
          }
        }}
      />
    </>
  );
};
