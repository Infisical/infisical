import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetOIDCConfig } from "@app/hooks/api";
import { useCreateOIDCConfig, useUpdateOIDCConfig } from "@app/hooks/api/oidcConfig/mutations";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["addOIDC"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addOIDC"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addOIDC"]>, state?: boolean) => void;
};

const schema = z.object({
  issuer: z.string().min(1),
  authorizationEndpoint: z.string().min(1),
  jwksUri: z.string().min(1),
  tokenEndpoint: z.string().min(1),
  userinfoEndpoint: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  allowedEmailDomains: z.string().optional()
});

export type OIDCFormData = z.infer<typeof schema>;

export const OIDCModal = ({ popUp, handlePopUpClose, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();

  const { mutateAsync: createMutateAsync, isLoading: createIsLoading } = useCreateOIDCConfig();
  const { mutateAsync: updateMutateAsync, isLoading: updateIsLoading } = useUpdateOIDCConfig();
  const { data } = useGetOIDCConfig(currentOrg?.slug ?? "");

  const { control, handleSubmit, reset, setValue } = useForm<OIDCFormData>({
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (data) {
      setValue("issuer", data.issuer);
      setValue("authorizationEndpoint", data.authorizationEndpoint);
      setValue("jwksUri", data.jwksUri);
      setValue("tokenEndpoint", data.tokenEndpoint);
      setValue("userinfoEndpoint", data.userinfoEndpoint);
      setValue("clientId", data.clientId);
      setValue("clientSecret", data.clientSecret);
      setValue("allowedEmailDomains", data.allowedEmailDomains);
    }
  }, [data]);

  const onOIDCModalSubmit = async ({
    issuer,
    authorizationEndpoint,
    allowedEmailDomains,
    jwksUri,
    tokenEndpoint,
    userinfoEndpoint,
    clientId,
    clientSecret
  }: OIDCFormData) => {
    try {
      if (!currentOrg) return;

      if (!data) {
        await createMutateAsync({
          issuer,
          authorizationEndpoint,
          allowedEmailDomains,
          jwksUri,
          tokenEndpoint,
          userinfoEndpoint,
          clientId,
          clientSecret,
          isActive: true,
          orgSlug: currentOrg.slug
        });
      } else {
        await updateMutateAsync({
          issuer,
          authorizationEndpoint,
          allowedEmailDomains,
          jwksUri,
          tokenEndpoint,
          userinfoEndpoint,
          clientId,
          clientSecret,
          isActive: true,
          orgSlug: currentOrg.slug
        });
      }

      handlePopUpClose("addOIDC");

      createNotification({
        text: `Successfully ${!data ? "added" : "updated"} OIDC SSO configuration`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${!data ? "add" : "update"} OIDC SSO configuration`,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.addOIDC?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addOIDC", isOpen);
        reset();
      }}
    >
      <ModalContent title="Manage OIDC configuration">
        <form onSubmit={handleSubmit(onOIDCModalSubmit)}>
          <Controller
            control={control}
            name="issuer"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Issuer" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} placeholder="https://accounts.google.com" autoComplete="off" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="authorizationEndpoint"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Authorization Endpoint"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input
                  {...field}
                  placeholder="https://accounts.google.com/o/oauth2/v2/auth"
                  autoComplete="off"
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="tokenEndpoint"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Token Endpoint"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input
                  {...field}
                  placeholder="https://oauth2.googleapis.com/token"
                  autoComplete="off"
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="userinfoEndpoint"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="User info endpoint"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input
                  {...field}
                  placeholder="https://openidconnect.googleapis.com/v1/userinfo"
                  autoComplete="off"
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="jwksUri"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="JWKS URI" errorText={error?.message} isError={Boolean(error)}>
                <Input
                  {...field}
                  placeholder="https://www.googleapis.com/oauth2/v3/certs"
                  autoComplete="off"
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="allowedEmailDomains"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Allowed Email Domains (defaults to any)"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input {...field} placeholder="infisical.com, google.com" autoComplete="off" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="clientId"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Client ID" errorText={error?.message} isError={Boolean(error)}>
                <Input
                  placeholder="Client ID"
                  type="password"
                  autoComplete="off"
                  {...field}
                  className="bg-mineshaft-800"
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="clientSecret"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Client Secret"
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Input
                  placeholder="Client Secret"
                  type="password"
                  autoComplete="off"
                  {...field}
                  className="bg-mineshaft-800"
                />
              </FormControl>
            )}
          />
          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={createIsLoading || updateIsLoading}
            >
              {!data ? "Add" : "Update"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpClose("addOIDC")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
