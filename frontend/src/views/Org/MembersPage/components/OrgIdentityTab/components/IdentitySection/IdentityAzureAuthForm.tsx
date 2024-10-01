import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal, FormControl, IconButton, Input } from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import {
  useAddIdentityAzureAuth,
  useGetIdentityAzureAuth,
  useUpdateIdentityAzureAuth
} from "@app/hooks/api";
import { IdentityAuthMethod } from "@app/hooks/api/identities";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { usePopUp, UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    tenantId: z.string().min(1),
    resource: z.string(),
    allowedServicePrincipalIds: z.string(),
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

export const IdentityAzureAuthForm = ({
  handlePopUpOpen,
  handlePopUpToggle,
  identityAuthMethodData,
  initialAuthMethod,
  revokeAuth
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();

  const { mutateAsync: addMutateAsync } = useAddIdentityAzureAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityAzureAuth();

  const isCurrentAuthMethod = identityAuthMethodData?.authMethod === initialAuthMethod;
  const { data } = useGetIdentityAzureAuth(identityAuthMethodData?.identityId ?? "", {
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
      tenantId: "",
      resource: "https://management.azure.com/",
      allowedServicePrincipalIds: "",
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
        tenantId: data.tenantId,
        resource: data.resource,
        allowedServicePrincipalIds: data.allowedServicePrincipalIds,
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
        tenantId: "",
        resource: "https://management.azure.com/",
        allowedServicePrincipalIds: "",
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "0",
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
      });
    }
  }, [data]);

  const onFormSubmit = async ({
    tenantId,
    resource,
    allowedServicePrincipalIds,
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
          identityId: identityAuthMethodData.identityId,
          tenantId,
          resource,
          allowedServicePrincipalIds,
          accessTokenTTL: Number(accessTokenTTL),
          accessTokenMaxTTL: Number(accessTokenMaxTTL),
          accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
          accessTokenTrustedIps
        });
      } else {
        await addMutateAsync({
          organizationId: orgId,
          identityId: identityAuthMethodData.identityId,
          tenantId: tenantId || "",
          resource: resource || "",
          allowedServicePrincipalIds: allowedServicePrincipalIds || "",
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
          name="tenantId"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Tenant ID"
              isError={Boolean(error)}
              errorText={error?.message}
              isRequired
            >
              <Input {...field} placeholder="00000000-0000-0000-0000-000000000000" type="text" />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="resource"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Resource / Audience"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input {...field} placeholder="https://management.azure.com/" />
            </FormControl>
          )}
        />
        <Controller
          control={control}
          name="allowedServicePrincipalIds"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Allowed Service Principal IDs"
              isError={Boolean(error)}
              errorText={error?.message}
            >
              <Input {...field} placeholder="00000000-0000-0000-0000-000000000000, ..." />
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
