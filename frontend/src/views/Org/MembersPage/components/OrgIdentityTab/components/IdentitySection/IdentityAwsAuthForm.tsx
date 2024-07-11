import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton, Input } from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import {
  useAddIdentityAwsAuth,
  useGetIdentityAwsAuth,
  useUpdateIdentityAwsAuth
} from "@app/hooks/api";
import { IdentityAuthMethod } from "@app/hooks/api/identities";
import { IdentityTrustedIp } from "@app/hooks/api/identities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = yup
  .object({
    stsEndpoint: yup.string(),
    allowedPrincipalArns: yup.string(),
    allowedAccountIds: yup.string(),
    accessTokenTTL: yup
      .string()
      .required("Access Token TTL is required")
      .test(
        "is-value-valid",
        "Access Token TTL cannot be greater than 315360000",
        (value) => Number(value) <= 315360000
      ),
    accessTokenMaxTTL: yup
      .string()
      .required("Access Max Token TTL is required")
      .test(
        "is-value-valid",
        "Access Token Max TTL cannot be greater than 315360000",
        (value) => Number(value) <= 315360000
      ),
    accessTokenNumUsesLimit: yup.string().required("Access Token Max Number of Uses is required"),
    accessTokenTrustedIps: yup
      .array(
        yup.object({
          ipAddress: yup.string().max(50).required().label("IP Address")
        })
      )
      .min(1)
      .required()
      .label("Access Token Trusted IP")
  })
  .required();

export type FormData = yup.InferType<typeof schema>;

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
};

export const IdentityAwsAuthForm = ({
  handlePopUpOpen,
  handlePopUpToggle,
  identityAuthMethodData
}: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { subscription } = useSubscription();

  const { mutateAsync: addMutateAsync } = useAddIdentityAwsAuth();
  const { mutateAsync: updateMutateAsync } = useUpdateIdentityAwsAuth();

  const { data } = useGetIdentityAwsAuth(identityAuthMethodData?.identityId ?? "");

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      stsEndpoint: "https://sts.amazonaws.com/",
      allowedPrincipalArns: "",
      allowedAccountIds: "",
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
        stsEndpoint: data.stsEndpoint,
        allowedPrincipalArns: data.allowedPrincipalArns,
        allowedAccountIds: data.allowedAccountIds,
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
        stsEndpoint: "https://sts.amazonaws.com/",
        allowedPrincipalArns: "",
        allowedAccountIds: "",
        accessTokenTTL: "2592000",
        accessTokenMaxTTL: "2592000",
        accessTokenNumUsesLimit: "0",
        accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
      });
    }
  }, [data]);

  const onFormSubmit = async ({
    allowedPrincipalArns,
    allowedAccountIds,
    stsEndpoint,
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
          stsEndpoint,
          allowedPrincipalArns,
          allowedAccountIds,
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
          stsEndpoint: stsEndpoint || "",
          allowedPrincipalArns: allowedPrincipalArns || "",
          allowedAccountIds: allowedAccountIds || "",
          accessTokenTTL: Number(accessTokenTTL),
          accessTokenMaxTTL: Number(accessTokenMaxTTL),
          accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit),
          accessTokenTrustedIps
        });
      }

      handlePopUpToggle("identityAuthMethod", false);

      createNotification({
        text: `Successfully ${
          identityAuthMethodData?.authMethod ? "updated" : "configured"
        } auth method`,
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
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        defaultValue="2592000"
        name="allowedPrincipalArns"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Allowed Principal ARNs"
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input
              {...field}
              placeholder="arn:aws:iam::123456789012:role/MyRoleName, arn:aws:iam::123456789012:user/MyUserName..."
              type="text"
            />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="allowedAccountIds"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Allowed Account IDs"
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input {...field} placeholder="123456789012, ..." />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        defaultValue="https://sts.amazonaws.com/"
        name="stsEndpoint"
        render={({ field, fieldState: { error } }) => (
          <FormControl label="STS Endpoint" isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} placeholder="https://sts.amazonaws.com/" type="text" />
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
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
          >
            {identityAuthMethodData?.authMethod ? "Update" : "Configure"}
          </Button>
          <Button
            colorSchema="secondary"
            variant="plain"
            onClick={() => handlePopUpToggle("identityAuthMethod", false)}
          >
            Cancel
          </Button>
        </div>
        {identityAuthMethodData?.authMethod && (
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
