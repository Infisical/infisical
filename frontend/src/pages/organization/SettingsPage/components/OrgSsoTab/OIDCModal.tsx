import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon, Trash2 } from "lucide-react";
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
  Badge,
  Button,
  Code,
  DocumentationLinkBadge,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TagsInput
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetOIDCConfig } from "@app/hooks/api";
import { useCreateOIDCConfig, useUpdateOIDCConfig } from "@app/hooks/api/oidcConfig/mutations";
import { OIDCJWTSignatureAlgorithm } from "@app/hooks/api/oidcConfig/types";
import { SsoMfaTrust } from "@app/hooks/api/organization/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { FormSection, rejectDuplicateTag } from "./SsoFormSection";

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
    clientSecret: z.string().optional(),
    allowedEmailDomains: z.string().optional(),
    jwtSignatureAlgorithm: z.nativeEnum(OIDCJWTSignatureAlgorithm).optional(),
    mfaClaimName: z
      .string()
      .trim()
      .min(1, "Claim name is required")
      .max(128, "Claim name is too long")
      .default("amr"),
    mfaAmrValues: z
      .array(z.string().trim().min(1).max(64, "Value is too long"))
      .max(20, "At most 20 values")
      .optional()
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
  const [isClientSecretRevealed, setIsClientSecretRevealed] = useState(false);
  const [amrValueTagError, setAmrValueTagError] = useState<string | null>(null);

  const { data } = useGetOIDCConfig(currentOrg?.id ?? "");

  const { control, handleSubmit, reset, setValue, setError, watch } = useForm<OIDCFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      configurationType: ConfigurationType.DISCOVERY_URL,
      mfaClaimName: "amr",
      mfaAmrValues: []
    }
  });

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

  // The stored secret never returns to the form; a blank field on update keeps it.
  useEffect(() => {
    if (data) {
      setValue("issuer", data.issuer);
      setValue("authorizationEndpoint", data.authorizationEndpoint);
      setValue("jwksUri", data.jwksUri);
      setValue("tokenEndpoint", data.tokenEndpoint);
      setValue("userinfoEndpoint", data.userinfoEndpoint);
      setValue("discoveryURL", data.discoveryURL);
      setValue("clientId", data.clientId);
      setValue("clientSecret", "");
      setValue("allowedEmailDomains", data.allowedEmailDomains ?? "");
      setValue("configurationType", data.configurationType);
      setValue("jwtSignatureAlgorithm", data.jwtSignatureAlgorithm);
      setValue("mfaClaimName", data.mfaClaimName || "amr");
      setValue("mfaAmrValues", data.mfaAmrValues ?? []);
    }
  }, [data]);

  const isExistingConfig = Boolean(data?.isActive);
  const hasStoredSecret = Boolean(data?.clientSecret);

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
    jwtSignatureAlgorithm,
    mfaClaimName,
    mfaAmrValues
  }: OIDCFormData) => {
    if (!currentOrg) return;

    const mfaSignal = {
      mfaClaimName,
      mfaAmrValues: mfaAmrValues && mfaAmrValues.length > 0 ? mfaAmrValues : null
    };
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
      isActive: true,
      organizationId: currentOrg.id,
      jwtSignatureAlgorithm,
      ...mfaSignal
    };

    const isConnectionUnchanged =
      data?.isActive &&
      !clientSecret &&
      configurationType === data.configurationType &&
      (issuer ?? "") === (data.issuer ?? "") &&
      (discoveryURL ?? "") === (data.discoveryURL ?? "") &&
      (authorizationEndpoint ?? "") === (data.authorizationEndpoint ?? "") &&
      (jwksUri ?? "") === (data.jwksUri ?? "") &&
      (tokenEndpoint ?? "") === (data.tokenEndpoint ?? "") &&
      (userinfoEndpoint ?? "") === (data.userinfoEndpoint ?? "") &&
      (allowedEmailDomains ?? "") === (data.allowedEmailDomains ?? "") &&
      clientId === data.clientId &&
      jwtSignatureAlgorithm === data.jwtSignatureAlgorithm;

    // Switching providers keeps the row but blanks its secret, so an existing row is not proof one is stored.
    if (!hasStoredSecret && !clientSecret) {
      setError("clientSecret", { message: "Client Secret is required" });
      return;
    }

    if (!data) {
      await createMutateAsync({ ...payload, clientSecret: clientSecret as string });
    } else if (isConnectionUnchanged) {
      await updateMutateAsync({ organizationId: currentOrg.id, ...mfaSignal });
    } else {
      await updateMutateAsync({ ...payload, ...(clientSecret ? { clientSecret } : {}) });
    }

    handlePopUpClose("addOIDC");

    createNotification({
      text: `Successfully ${data?.isActive ? "updated" : "added"} OIDC SSO configuration`,
      type: "success"
    });
  };

  const isPending = createIsLoading || updateIsLoading;
  const isMfaSignalInUse = currentOrg?.ssoMfaTrust === SsoMfaTrust.Signal;

  const urlField = (
    name: "issuer" | "authorizationEndpoint" | "tokenEndpoint" | "jwksUri" | "userinfoEndpoint",
    label: string,
    placeholder: string
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Field>
          <FieldLabel htmlFor={`oidc-${name}`}>{label}</FieldLabel>
          <Input
            id={`oidc-${name}`}
            placeholder={placeholder}
            autoComplete="off"
            isError={Boolean(error)}
            {...field}
          />
          <FieldError>{error?.message}</FieldError>
        </Field>
      )}
    />
  );

  return (
    <>
      <Sheet
        open={popUp?.addOIDC?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addOIDC", isOpen);
          reset();
          setIsClientSecretRevealed(false);
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
            <div className="thin-scrollbar flex-1 overflow-y-auto">
              <FormSection
                title="Identity Provider"
                description="How Infisical locates your IdP's OIDC endpoints."
              >
                <Controller
                  control={control}
                  name="configurationType"
                  render={({ field: { onChange, value } }) => (
                    <Field>
                      <FieldLabel>Configuration Type</FieldLabel>
                      <Tabs value={value} onValueChange={onChange}>
                        <TabsList
                          variant="filled"
                          aria-label="Configuration type"
                          className="w-full"
                        >
                          <TabsTrigger value={ConfigurationType.DISCOVERY_URL}>
                            Discovery URL
                          </TabsTrigger>
                          <TabsTrigger value={ConfigurationType.CUSTOM}>
                            Custom Endpoints
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
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
                          placeholder="https://idp.example.com/.well-known/openid-configuration"
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
                    {urlField("issuer", "Issuer", "https://idp.example.com")}
                    {urlField(
                      "authorizationEndpoint",
                      "Authorization Endpoint",
                      "https://idp.example.com/authorize"
                    )}
                    {urlField("tokenEndpoint", "Token Endpoint", "https://idp.example.com/token")}
                    {urlField("jwksUri", "JWKS URI", "https://idp.example.com/jwks")}
                    {urlField(
                      "userinfoEndpoint",
                      "Userinfo Endpoint",
                      "https://idp.example.com/userinfo"
                    )}
                  </>
                )}
                <Controller
                  control={control}
                  defaultValue={OIDCJWTSignatureAlgorithm.RS256}
                  name="jwtSignatureAlgorithm"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="oidc-jwt-algorithm">JWT Signature Algorithm</FieldLabel>
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
              </FormSection>

              <FormSection
                title="Client Credentials"
                description="From the OIDC client you registered for Infisical in your IdP."
              >
                <Controller
                  control={control}
                  name="clientId"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="oidc-client-id">Client ID</FieldLabel>
                      <Input
                        id="oidc-client-id"
                        className="font-mono"
                        placeholder="infisical-web"
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
                  name="clientSecret"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="oidc-client-secret">Client Secret</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id="oidc-client-secret"
                          type={isClientSecretRevealed ? "text" : "password"}
                          placeholder={
                            hasStoredSecret
                              ? "Stored. Enter a new value to replace it."
                              : "Client Secret"
                          }
                          autoComplete="new-password"
                          isError={Boolean(error)}
                          {...field}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            aria-label={
                              isClientSecretRevealed ? "Hide client secret" : "Show client secret"
                            }
                            onClick={() => setIsClientSecretRevealed((previous) => !previous)}
                          >
                            {isClientSecretRevealed ? <EyeOffIcon /> : <EyeIcon />}
                          </InputGroupButton>
                        </InputGroupAddon>
                      </InputGroup>
                      {hasStoredSecret && (
                        <FieldDescription>Leave blank to keep the current secret.</FieldDescription>
                      )}
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </FormSection>

              <FormSection
                title="Access"
                description="Limit which users can sign in through this IdP."
              >
                <Controller
                  control={control}
                  name="allowedEmailDomains"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="oidc-allowed-domains">
                        Allowed Email Domains (Optional)
                      </FieldLabel>
                      <Input
                        id="oidc-allowed-domains"
                        placeholder="infisical.com, *.google.com"
                        autoComplete="off"
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldDescription>
                        Any domain is allowed if empty. Supports wildcards, e.g. *.example.com.
                      </FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </FormSection>

              <FormSection
                title="MFA Signal"
                description="Read when Trust IdP MFA is on, to decide whether to skip the Infisical MFA prompt."
                badge={isMfaSignalInUse ? <Badge variant="success">In Use</Badge> : undefined}
              >
                <Controller
                  control={control}
                  name="mfaClaimName"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="oidc-mfa-claim-name">MFA Claim Name</FieldLabel>
                      <Input
                        id="oidc-mfa-claim-name"
                        className="font-mono"
                        placeholder="amr"
                        autoComplete="off"
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldDescription>
                        ID token claim listing the authentication methods the user completed.
                      </FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="mfaAmrValues"
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="oidc-mfa-amr-values">
                        Additional MFA Claim Values (Optional)
                      </FieldLabel>
                      <TagsInput
                        id="oidc-mfa-amr-values"
                        placeholder="Type a value, press Enter"
                        value={value ?? []}
                        onValueChange={onChange}
                        validateTag={rejectDuplicateTag}
                        onValidationError={setAmrValueTagError}
                        isError={Boolean(amrValueTagError || error)}
                      />
                      <FieldDescription>
                        Counted as MFA in addition to the standard <Code>mfa</Code> value.
                      </FieldDescription>
                      <FieldError>{amrValueTagError ?? error?.message}</FieldError>
                    </Field>
                  )}
                />
              </FormSection>
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
