import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetOIDCConfig } from "@app/hooks/api";
import { useCreateOIDCConfig, useUpdateOIDCConfig } from "@app/hooks/api/oidcConfig/mutations";
import { OIDCJWTSignatureAlgorithm } from "@app/hooks/api/oidcConfig/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

enum ConfigurationType {
  CUSTOM = "custom",
  DISCOVERY_URL = "discoveryURL"
}

type Props = {
  popUp: UsePopUpState<["addOIDC"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addOIDC"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addOIDC"]>, state?: boolean) => void;
  hideDelete?: boolean;
};

const schema = z
  .object({
    configurationType: z.string(),
    issuer: z.string().optional(),
    discoveryURL: z.string().optional(),
    authorizationEndpoint: z.string().optional(),
    jwksUri: z.string().optional(),
    tokenEndpoint: z.string().optional(),
    userinfoEndpoint: z.string().optional(),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    allowedEmailDomains: z.string().optional(),
    jwtSignatureAlgorithm: z.nativeEnum(OIDCJWTSignatureAlgorithm).optional()
  })
  .superRefine((data, ctx) => {
    if (data.configurationType === ConfigurationType.CUSTOM) {
      if (!data.issuer) {
        ctx.addIssue({
          path: ["issuer"],
          message: "Issuer is required",
          code: z.ZodIssueCode.custom
        });
      }
      if (!data.authorizationEndpoint) {
        ctx.addIssue({
          path: ["authorizationEndpoint"],
          message: "Authorization endpoint is required",
          code: z.ZodIssueCode.custom
        });
      }
      if (!data.jwksUri) {
        ctx.addIssue({
          path: ["jwksUri"],
          message: "JWKS URI is required",
          code: z.ZodIssueCode.custom
        });
      }
      if (!data.tokenEndpoint) {
        ctx.addIssue({
          path: ["tokenEndpoint"],
          message: "Token endpoint is required",
          code: z.ZodIssueCode.custom
        });
      }
      if (!data.userinfoEndpoint) {
        ctx.addIssue({
          path: ["userinfoEndpoint"],
          message: "Userinfo endpoint is required",
          code: z.ZodIssueCode.custom
        });
      }
    } else {
      // eslint-disable-next-line no-lonely-if
      if (!data.discoveryURL) {
        ctx.addIssue({
          path: ["discoveryURL"],
          message: "Discovery URL is required",
          code: z.ZodIssueCode.custom
        });
      }
    }
  });

export type OIDCFormData = z.infer<typeof schema>;

export const OIDCModal = ({ popUp, handlePopUpClose, handlePopUpToggle, hideDelete }: Props) => {
  const { currentOrg } = useOrganization();

  const { mutateAsync: createMutateAsync, isPending: createIsLoading } = useCreateOIDCConfig();
  const { mutateAsync: updateMutateAsync, isPending: updateIsLoading } = useUpdateOIDCConfig();
  const [isDeletePopupOpen, setIsDeletePopupOpen] = useToggle(false);

  const { data } = useGetOIDCConfig(currentOrg?.id ?? "");

  const { control, handleSubmit, reset, setValue, watch } = useForm<OIDCFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      configurationType: ConfigurationType.DISCOVERY_URL
    }
  });

  const [isClientIdFocused, setIsClientIdFocused] = useToggle();
  const [isClientSecretFocused, setIsClientSecretFocused] = useToggle();

  const configurationTypeValue = watch("configurationType");
  const handleOidcSoftDelete = async () => {
    if (!currentOrg) {
      return;
    }
    await updateMutateAsync({
      issuer: "",
      discoveryURL: "",
      authorizationEndpoint: "",
      allowedEmailDomains: "",
      jwksUri: "",
      tokenEndpoint: "",
      userinfoEndpoint: "",
      clientId: "",
      clientSecret: "",
      isActive: false,
      organizationId: currentOrg.id
    });

    createNotification({
      text: "Successfully deleted OIDC configuration.",
      type: "success"
    });
  };

  useEffect(() => {
    if (data) {
      setValue("issuer", data.issuer);
      setValue("authorizationEndpoint", data.authorizationEndpoint);
      setValue("jwksUri", data.jwksUri);
      setValue("tokenEndpoint", data.tokenEndpoint);
      setValue("userinfoEndpoint", data.userinfoEndpoint);
      setValue("discoveryURL", data.discoveryURL);
      setValue("clientId", data.clientId);
      setValue("clientSecret", data.clientSecret);
      setValue("allowedEmailDomains", data.allowedEmailDomains);
      setValue("configurationType", data.configurationType);
      setValue("jwtSignatureAlgorithm", data.jwtSignatureAlgorithm);
    }
  }, [data]);

  const onOIDCModalSubmit = async ({
    issuer,
    authorizationEndpoint,
    allowedEmailDomains,
    jwksUri,
    tokenEndpoint,
    userinfoEndpoint,
    configurationType,
    discoveryURL,
    clientId,
    clientSecret,
    jwtSignatureAlgorithm
  }: OIDCFormData) => {
    if (!currentOrg) {
      return;
    }

    if (!data) {
      await createMutateAsync({
        issuer,
        configurationType,
        discoveryURL,
        authorizationEndpoint,
        allowedEmailDomains,
        jwksUri,
        tokenEndpoint,
        userinfoEndpoint,
        clientId,
        clientSecret,
        isActive: true,
        organizationId: currentOrg.id,
        jwtSignatureAlgorithm
      });
    } else {
      await updateMutateAsync({
        issuer,
        configurationType,
        discoveryURL,
        authorizationEndpoint,
        allowedEmailDomains,
        jwksUri,
        tokenEndpoint,
        userinfoEndpoint,
        clientId,
        clientSecret,
        isActive: true,
        organizationId: currentOrg.id,
        jwtSignatureAlgorithm
      });
    }

    handlePopUpClose("addOIDC");

    createNotification({
      text: `Successfully ${!data ? "added" : "updated"} OIDC SSO configuration`,
      type: "success"
    });
  };

  return (
    <>
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
              name="configurationType"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  label="Configuration Type"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    className="w-full"
                    defaultValue="discoveryURL"
                    {...field}
                    onValueChange={(e) => onChange(e)}
                  >
                    <SelectItem value={ConfigurationType.DISCOVERY_URL}>Discovery URL</SelectItem>
                    <SelectItem value={ConfigurationType.CUSTOM}>Custom</SelectItem>
                  </Select>
                </FormControl>
              )}
            />
            {configurationTypeValue === ConfigurationType.DISCOVERY_URL && (
              <Controller
                control={control}
                name="discoveryURL"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Discovery Document URL"
                    errorText={error?.message}
                    isError={Boolean(error)}
                  >
                    <Input
                      {...field}
                      placeholder="https://accounts.google.com/.well-known/openid-configuration"
                      autoComplete="off"
                    />
                  </FormControl>
                )}
              />
            )}
            {configurationTypeValue === ConfigurationType.CUSTOM && (
              <>
                <Controller
                  control={control}
                  name="issuer"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl label="Issuer" errorText={error?.message} isError={Boolean(error)}>
                      <Input
                        {...field}
                        placeholder="https://accounts.google.com"
                        autoComplete="off"
                      />
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
                    <FormControl
                      label="JWKS URI"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input
                        {...field}
                        placeholder="https://www.googleapis.com/oauth2/v3/certs"
                        autoComplete="off"
                      />
                    </FormControl>
                  )}
                />
              </>
            )}
            <Controller
              control={control}
              defaultValue={OIDCJWTSignatureAlgorithm.RS256}
              name="jwtSignatureAlgorithm"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl
                  className="w-full"
                  label="JWT Signature Algorithm"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Select
                    defaultValue={field.value}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                  >
                    <SelectItem value={OIDCJWTSignatureAlgorithm.RS256}>RS256</SelectItem>
                    <SelectItem value={OIDCJWTSignatureAlgorithm.RS512}>RS512</SelectItem>
                    <SelectItem value={OIDCJWTSignatureAlgorithm.HS256}>HS256</SelectItem>
                    <SelectItem value={OIDCJWTSignatureAlgorithm.EDDSA}>EdDSA</SelectItem>
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="allowedEmailDomains"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Allowed Email Domains (defaults to any, supports wildcards e.g. *.example.com)"
                  errorText={error?.message}
                  isError={Boolean(error)}
                >
                  <Input {...field} placeholder="infisical.com, *.google.com" autoComplete="off" />
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
                    type={isClientIdFocused ? "text" : "password"}
                    onFocus={() => setIsClientIdFocused.on()}
                    {...field}
                    onBlur={() => {
                      field.onBlur();
                      setIsClientIdFocused.off();
                    }}
                    autoComplete="off"
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
                    {...field}
                    placeholder="Client Secret"
                    type={isClientSecretFocused ? "text" : "password"}
                    autoComplete="off"
                    onFocus={() => setIsClientSecretFocused.on()}
                    onBlur={() => {
                      field.onBlur();
                      setIsClientSecretFocused.off();
                    }}
                    className="bg-mineshaft-800"
                  />
                </FormControl>
              )}
            />
            <div className="mt-8 flex justify-between">
              <div className="flex items-center">
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
              {!hideDelete && (
                <Button colorSchema="danger" onClick={() => setIsDeletePopupOpen.on()}>
                  Delete
                </Button>
              )}
            </div>
          </form>
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={isDeletePopupOpen}
        title="Are you sure you want to delete OIDC?"
        onChange={() => setIsDeletePopupOpen.toggle()}
        deleteKey="confirm"
        onDeleteApproved={handleOidcSoftDelete}
      />
    </>
  );
};
