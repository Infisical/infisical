import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  DocumentationLinkBadge,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
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
    clientId: z.string().min(1, "Client ID is required"),
    clientSecret: z.string().min(1, "Client Secret is required"),
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
    } else if (!data.discoveryURL) {
      ctx.addIssue({
        path: ["discoveryURL"],
        message: "Discovery URL is required",
        code: z.ZodIssueCode.custom
      });
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
    if (!currentOrg) return;
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
    if (!currentOrg) return;

    const payload = {
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
    };

    if (!data) {
      await createMutateAsync(payload);
    } else {
      await updateMutateAsync(payload);
    }

    handlePopUpClose("addOIDC");

    createNotification({
      text: `Successfully ${data?.isActive ? "updated" : "added"} OIDC SSO configuration`,
      type: "success"
    });
  };

  const isPending = createIsLoading || updateIsLoading;
  const isExistingConfig = Boolean(data?.isActive);

  return (
    <>
      <Sheet
        open={popUp?.addOIDC?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addOIDC", isOpen);
          reset();
        }}
      >
        <SheetContent className="sm:max-w-xl">
          <form onSubmit={handleSubmit(onOIDCModalSubmit)} className="flex h-full min-h-0 flex-col">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-x-2">
                Manage OIDC Configuration
                <DocumentationLinkBadge href="https://infisical.com/docs/integrations/user-authentication" />
              </SheetTitle>
            </SheetHeader>
            <div className="thin-scrollbar flex-1 overflow-y-auto px-4">
              <FieldGroup>
                <Controller
                  control={control}
                  name="configurationType"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="oidc-configuration-type">Configuration Type</FieldLabel>
                      <Select value={value} onValueChange={onChange}>
                        <SelectTrigger
                          id="oidc-configuration-type"
                          className="w-full"
                          isError={Boolean(error)}
                        >
                          <SelectValue placeholder="Select configuration type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ConfigurationType.DISCOVERY_URL}>
                            Discovery URL
                          </SelectItem>
                          <SelectItem value={ConfigurationType.CUSTOM}>Custom</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                {configurationTypeValue === ConfigurationType.DISCOVERY_URL && (
                  <Controller
                    control={control}
                    name="discoveryURL"
                    render={({ field, fieldState: { error } }) => (
                      <Field>
                        <FieldLabel htmlFor="oidc-discovery-url">Discovery Document URL</FieldLabel>
                        <Input
                          id="oidc-discovery-url"
                          placeholder="https://accounts.google.com/.well-known/openid-configuration"
                          autoComplete="off"
                          isError={Boolean(error)}
                          {...field}
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                )}
                {configurationTypeValue === ConfigurationType.CUSTOM && (
                  <>
                    <Controller
                      control={control}
                      name="issuer"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel htmlFor="oidc-issuer">Issuer</FieldLabel>
                          <Input
                            id="oidc-issuer"
                            placeholder="https://accounts.google.com"
                            autoComplete="off"
                            isError={Boolean(error)}
                            {...field}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name="authorizationEndpoint"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel htmlFor="oidc-authorization-endpoint">
                            Authorization Endpoint
                          </FieldLabel>
                          <Input
                            id="oidc-authorization-endpoint"
                            placeholder="https://accounts.google.com/o/oauth2/v2/auth"
                            autoComplete="off"
                            isError={Boolean(error)}
                            {...field}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name="tokenEndpoint"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel htmlFor="oidc-token-endpoint">Token Endpoint</FieldLabel>
                          <Input
                            id="oidc-token-endpoint"
                            placeholder="https://oauth2.googleapis.com/token"
                            autoComplete="off"
                            isError={Boolean(error)}
                            {...field}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name="userinfoEndpoint"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel htmlFor="oidc-userinfo-endpoint">
                            Userinfo Endpoint
                          </FieldLabel>
                          <Input
                            id="oidc-userinfo-endpoint"
                            placeholder="https://openidconnect.googleapis.com/v1/userinfo"
                            autoComplete="off"
                            isError={Boolean(error)}
                            {...field}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                    <Controller
                      control={control}
                      name="jwksUri"
                      render={({ field, fieldState: { error } }) => (
                        <Field>
                          <FieldLabel htmlFor="oidc-jwks-uri">JWKS URI</FieldLabel>
                          <Input
                            id="oidc-jwks-uri"
                            placeholder="https://www.googleapis.com/oauth2/v3/certs"
                            autoComplete="off"
                            isError={Boolean(error)}
                            {...field}
                          />
                          <FieldError>{error?.message}</FieldError>
                        </Field>
                      )}
                    />
                  </>
                )}
                <Controller
                  control={control}
                  defaultValue={OIDCJWTSignatureAlgorithm.RS256}
                  name="jwtSignatureAlgorithm"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel
                        htmlFor="oidc-jwt-algorithm"
                        className="inline-flex flex-wrap items-baseline gap-1.5"
                      >
                        JWT Signature Algorithm
                      </FieldLabel>
                      <Select value={value} onValueChange={onChange}>
                        <SelectTrigger
                          id="oidc-jwt-algorithm"
                          className="w-full"
                          isError={Boolean(error)}
                        >
                          <SelectValue placeholder="Select algorithm" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OIDCJWTSignatureAlgorithm.RS256}>RS256</SelectItem>
                          <SelectItem value={OIDCJWTSignatureAlgorithm.RS512}>RS512</SelectItem>
                          <SelectItem value={OIDCJWTSignatureAlgorithm.HS256}>HS256</SelectItem>
                          <SelectItem value={OIDCJWTSignatureAlgorithm.EDDSA}>EdDSA</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="allowedEmailDomains"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel
                        htmlFor="oidc-allowed-domains"
                        className="inline-flex flex-wrap items-baseline gap-1.5"
                      >
                        Allowed Email Domains (optional)
                      </FieldLabel>
                      <Input
                        id="oidc-allowed-domains"
                        placeholder="infisical.com, *.google.com"
                        autoComplete="off"
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldDescription>
                        Defaults to any. Supports wildcards (e.g. *.example.com).
                      </FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="clientId"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="oidc-client-id">Client ID</FieldLabel>
                      <Input
                        id="oidc-client-id"
                        placeholder="Client ID"
                        type={isClientIdFocused ? "text" : "password"}
                        autoComplete="off"
                        isError={Boolean(error)}
                        onFocus={() => setIsClientIdFocused.on()}
                        {...field}
                        onBlur={() => {
                          field.onBlur();
                          setIsClientIdFocused.off();
                        }}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="clientSecret"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="oidc-client-secret">Client Secret</FieldLabel>
                      <Input
                        id="oidc-client-secret"
                        placeholder="Client Secret"
                        type={isClientSecretFocused ? "text" : "password"}
                        autoComplete="off"
                        isError={Boolean(error)}
                        onFocus={() => setIsClientSecretFocused.on()}
                        {...field}
                        onBlur={() => {
                          field.onBlur();
                          setIsClientSecretFocused.off();
                        }}
                      />
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </FieldGroup>
            </div>
            <SheetFooter className="justify-between border-t">
              <div className="flex gap-2">
                <Button type="submit" variant="org" isPending={isPending}>
                  {isExistingConfig ? "Update Configuration" : "Configure OIDC"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => handlePopUpClose("addOIDC")}>
                  Cancel
                </Button>
              </div>
              {!hideDelete && (
                <Button type="button" variant="danger" onClick={() => setIsDeletePopupOpen.on()}>
                  Delete
                </Button>
              )}
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={isDeletePopupOpen} onOpenChange={() => setIsDeletePopupOpen.toggle()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete OIDC Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the OIDC connection. Members will no longer be able to sign in via OIDC
              until it&apos;s reconfigured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleOidcSoftDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
