import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLinkIcon, Trash2 } from "lucide-react";
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
  CopyButton,
  DocumentationLinkBadge,
  Field,
  FieldDescription,
  FieldError,
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
  SheetTitle,
  TagsInput,
  TextArea
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useToggle } from "@app/hooks";
import { useCreateSSOConfig, useGetSSOConfig, useUpdateSSOConfig } from "@app/hooks/api";
import { SsoMfaTrust } from "@app/hooks/api/organization/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { FieldHint, FormSection } from "./SsoFormSection";

enum AuthProvider {
  OKTA_SAML = "okta-saml",
  AZURE_SAML = "azure-saml",
  JUMPCLOUD_SAML = "jumpcloud-saml",
  KEYCLOAK_SAML = "keycloak-saml",
  GOOGLE_SAML = "google-saml",
  AUTH0_SAML = "auth0-saml"
}

const docsBaseUrl = "https://infisical.com/docs/documentation/platform/sso";

const ssoAuthProviders = [
  { name: "Okta", value: AuthProvider.OKTA_SAML, docsUrl: "okta" },
  { name: "Azure / Entra", value: AuthProvider.AZURE_SAML, docsUrl: "azure" },
  { name: "JumpCloud", value: AuthProvider.JUMPCLOUD_SAML, docsUrl: "jumpcloud" },
  { name: "Keycloak", value: AuthProvider.KEYCLOAK_SAML, docsUrl: "keycloak-saml" },
  { name: "Google", value: AuthProvider.GOOGLE_SAML, docsUrl: "google-saml" },
  { name: "Auth0", value: AuthProvider.AUTH0_SAML, docsUrl: "auth0-saml" }
];

// Labels as each provider's console names them. A hint gives the generic SAML term when the label hides it.
type TProviderLabels = {
  acsUrl: string;
  acsHint?: string;
  entityId: string;
  entityHint?: string;
  entryPoint: string;
  entryPointPlaceholder: string;
  issuer: string;
  issuerHint?: string;
  issuerPlaceholder: string;
};

const providerLabels = (authProvider: string): TProviderLabels => {
  switch (authProvider) {
    case AuthProvider.OKTA_SAML:
      return {
        acsUrl: "Single Sign-On URL",
        acsHint: "ACS URL",
        entityId: "Audience URI (SP Entity ID)",
        entryPoint: "Identity Provider Single Sign-On URL",
        entryPointPlaceholder: "https://your-domain.okta.com/app/app-name/xxx/sso/saml",
        issuer: "Identity Provider Issuer",
        issuerHint: "IdP Entity ID",
        issuerPlaceholder: "http://www.okta.com/xxx"
      };
    case AuthProvider.AZURE_SAML:
      return {
        acsUrl: "Reply URL",
        acsHint: "ACS URL",
        entityId: "Identifier (Entity ID)",
        entityHint: "SP Entity ID",
        entryPoint: "Login URL",
        entryPointPlaceholder: "https://login.microsoftonline.com/xxx/saml2",
        issuer: "Azure / Entra Application ID",
        issuerPlaceholder: "abc-def-ghi-jkl-mno"
      };
    case AuthProvider.JUMPCLOUD_SAML:
      return {
        acsUrl: "ACS URL",
        entityId: "SP Entity ID",
        entryPoint: "IdP URL",
        entryPointPlaceholder: "https://sso.jumpcloud.com/saml2/xxx",
        issuer: "IdP Entity ID",
        issuerPlaceholder: "JumpCloud"
      };
    case AuthProvider.KEYCLOAK_SAML:
      return {
        acsUrl: "Valid Redirect URI",
        acsHint: "ACS URL",
        entityId: "Client ID",
        entityHint: "SP Entity ID",
        entryPoint: "IdP URL",
        entryPointPlaceholder: "https://keycloak.mysite.com/realms/myrealm/protocol/saml",
        issuer: "Client ID",
        issuerPlaceholder: window.origin
      };
    case AuthProvider.GOOGLE_SAML:
      return {
        acsUrl: "ACS URL",
        entityId: "Entity ID",
        entityHint: "SP Entity ID",
        entryPoint: "SSO URL",
        entryPointPlaceholder: "https://accounts.google.com/o/saml2/idp?idpid=xxx",
        issuer: "Entity ID",
        issuerPlaceholder: window.origin
      };
    case AuthProvider.AUTH0_SAML:
      return {
        acsUrl: "Application Callback URL",
        acsHint: "ACS URL",
        entityId: "Audience",
        entityHint: "SP Entity ID",
        entryPoint: "Identity Provider Login URL",
        entryPointPlaceholder: "https://xxx.auth0.com/samlp/xxx",
        issuer: "Issuer",
        issuerHint: "IdP Entity ID",
        issuerPlaceholder: "urn:xxx.auth0.com"
      };
    default:
      return {
        acsUrl: "ACS URL",
        entityId: "SP Entity ID",
        entryPoint: "IdP SSO URL",
        entryPointPlaceholder: "https://idp.example.com/sso/saml",
        issuer: "IdP Entity ID",
        issuerPlaceholder: "https://idp.example.com"
      };
  }
};

const schema = z
  .object({
    authProvider: z.string().min(1, "SSO Type is required"),
    entryPoint: z.string().trim().min(1, "URL required"),
    issuer: z.string().trim().min(1, "Issuer required"),
    cert: z.string().default(""),
    mfaSignalAttribute: z
      .string()
      .trim()
      .min(1, "Attribute name is required")
      .max(512, "Attribute name is too long")
      .default("amr"),
    mfaAuthnContexts: z
      .array(z.string().trim().min(1).max(512, "Context value is too long"))
      .max(20, "At most 20 contexts")
      .default([])
  })
  .required();

export type AddSSOFormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["addSSO"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["addSSO"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addSSO"]>, state?: boolean) => void;
  hideDelete?: boolean;
};

const CopyableValue = ({ label, hint, value }: { label: string; hint?: string; value: string }) => (
  <Field>
    <FieldLabel>
      {label}
      {hint && <FieldHint>{hint}</FieldHint>}
    </FieldLabel>
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1 rounded-md border border-border bg-foreground/5 px-3 py-2 font-mono text-sm break-all">
        {value}
      </div>
      <CopyButton value={value} ariaLabel={`Copy ${label}`} variant="outline" size="md" />
    </div>
  </Field>
);

export const SSOModal = ({ popUp, handlePopUpClose, handlePopUpToggle, hideDelete }: Props) => {
  const { currentOrg } = useOrganization();

  const { mutateAsync: createMutateAsync, isPending: createIsLoading } = useCreateSSOConfig();
  const { mutateAsync: updateMutateAsync, isPending: updateIsLoading } = useUpdateSSOConfig();
  const [isDeletePopupOpen, setIsDeletePopupOpen] = useToggle();
  const { data } = useGetSSOConfig(currentOrg?.id ?? "");

  const { control, handleSubmit, reset, watch, setValue, getValues } = useForm<AddSSOFormData>({
    defaultValues: {
      authProvider: AuthProvider.OKTA_SAML,
      mfaSignalAttribute: "amr",
      mfaAuthnContexts: []
    },
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (data) {
      reset({
        authProvider: data?.authProvider ?? "",
        entryPoint: data?.entryPoint ?? "",
        issuer: data?.issuer ?? "",
        cert: data?.cert ?? "",
        mfaSignalAttribute: data?.mfaSignalAttribute || "amr",
        mfaAuthnContexts: data?.mfaAuthnContexts ?? []
      });
    }
  }, [data]);

  const handleSamlSoftDelete = async () => {
    if (!currentOrg) {
      return;
    }
    await updateMutateAsync({
      organizationId: currentOrg.id,
      isActive: false,
      entryPoint: "",
      issuer: "",
      cert: ""
    });

    createNotification({
      text: "Successfully deleted SAML SSO configuration.",
      type: "success"
    });
  };

  const onSSOModalSubmit = async ({
    authProvider,
    entryPoint,
    issuer,
    cert,
    mfaSignalAttribute,
    mfaAuthnContexts
  }: AddSSOFormData) => {
    if (!currentOrg) return;

    const payload = {
      organizationId: currentOrg.id,
      authProvider,
      isActive: false,
      entryPoint,
      issuer,
      cert,
      mfaSignalAttribute,
      mfaAuthnContexts: mfaAuthnContexts.length > 0 ? mfaAuthnContexts : null
    };

    if (!data) {
      await createMutateAsync(payload);
    } else {
      await updateMutateAsync(payload);
    }

    handlePopUpClose("addSSO");

    createNotification({
      text: `Successfully ${!data ? "added" : "updated"} SAML SSO configuration`,
      type: "success"
    });
  };

  const authProvider = watch("authProvider");
  useEffect(() => {
    if (authProvider === AuthProvider.GOOGLE_SAML && getValues("issuer") === "") {
      setValue("issuer", window.origin);
    }
  }, [authProvider]);

  const isPending = createIsLoading || updateIsLoading;
  const labels = providerLabels(authProvider);
  const provider = ssoAuthProviders.find((item) => item.value === authProvider);
  const providerName = provider?.name ?? "your IdP";
  const isMfaSignalInUse = currentOrg?.ssoMfaTrust === SsoMfaTrust.Signal;

  return (
    <>
      <Sheet
        open={popUp?.addSSO?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addSSO", isOpen);
          reset();
        }}
      >
        <SheetContent className="sm:max-w-2xl">
          <form onSubmit={handleSubmit(onSSOModalSubmit)} className="flex h-full min-h-0 flex-col">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-x-2">
                Manage SAML Configuration
                <DocumentationLinkBadge href="https://infisical.com/docs/integrations/user-authentication" />
              </SheetTitle>
            </SheetHeader>
            <div className="thin-scrollbar flex-1 overflow-y-auto">
              <FormSection
                title="Identity Provider"
                description="Field names below match what your provider calls them."
              >
                <Controller
                  control={control}
                  name="authProvider"
                  defaultValue="okta-saml"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel
                        htmlFor="sso-auth-provider"
                        className="flex items-center justify-between"
                      >
                        Provider
                        {provider && (
                          <Badge variant="info" iconPosition="right" asChild>
                            <a
                              href={`${docsBaseUrl}/${provider.docsUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {provider.name} Documentation
                              <ExternalLinkIcon />
                            </a>
                          </Badge>
                        )}
                      </FieldLabel>
                      <Select value={value} onValueChange={onChange}>
                        <SelectTrigger
                          id="sso-auth-provider"
                          className="w-full"
                          isError={Boolean(error)}
                        >
                          <SelectValue placeholder="Select a provider" />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {ssoAuthProviders.map(({ name, value: providerValue }) => (
                            <SelectItem value={providerValue} key={providerValue}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </FormSection>

              {data && (
                <FormSection
                  title={`Add Infisical to ${providerName}`}
                  description={`Copy these values into the SAML app you create in ${providerName}.`}
                >
                  <CopyableValue
                    label={labels.acsUrl}
                    hint={labels.acsHint}
                    value={`${window.origin}/api/v1/sso/saml2/${data.id}`}
                  />
                  <CopyableValue
                    label={labels.entityId}
                    hint={labels.entityHint}
                    value={window.origin}
                  />
                </FormSection>
              )}

              <FormSection
                title={`Connect ${providerName} to Infisical`}
                description={`Paste the values ${providerName} shows for the SAML app.`}
              >
                <Controller
                  control={control}
                  name="entryPoint"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="sso-entry-point">
                        {labels.entryPoint}
                        <FieldHint>IdP SSO URL</FieldHint>
                      </FieldLabel>
                      <Input
                        id="sso-entry-point"
                        placeholder={labels.entryPointPlaceholder}
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
                  name="issuer"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="sso-issuer">
                        {labels.issuer}
                        {labels.issuerHint && <FieldHint>{labels.issuerHint}</FieldHint>}
                      </FieldLabel>
                      <Input
                        id="sso-issuer"
                        placeholder={labels.issuerPlaceholder}
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
                  name="cert"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="sso-cert">
                        X.509 Certificate
                        <FieldHint>Optional</FieldHint>
                      </FieldLabel>
                      <TextArea
                        id="sso-cert"
                        className="font-mono"
                        placeholder="-----BEGIN CERTIFICATE----- ..."
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldDescription>
                        Used to verify the signature on SAML responses from {providerName}.
                      </FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </FormSection>

              <FormSection
                title="MFA Signal"
                description="Read when Trust IdP MFA is on, to decide whether to skip the Infisical MFA prompt."
                badge={isMfaSignalInUse ? <Badge variant="success">In use</Badge> : undefined}
              >
                <Controller
                  control={control}
                  name="mfaSignalAttribute"
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="sso-mfa-signal-attribute">MFA Attribute Name</FieldLabel>
                      <Input
                        id="sso-mfa-signal-attribute"
                        className="font-mono"
                        placeholder="amr"
                        autoComplete="off"
                        isError={Boolean(error)}
                        {...field}
                      />
                      <FieldDescription>
                        Attribute in the {providerName} SAML assertion that lists the authentication
                        methods the user completed.
                      </FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="mfaAuthnContexts"
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel htmlFor="sso-mfa-authn-contexts">
                        Additional MFA Authentication Contexts
                        <FieldHint>Optional</FieldHint>
                      </FieldLabel>
                      <TagsInput
                        id="sso-mfa-authn-contexts"
                        placeholder="urn:oasis:names:tc:SAML:2.0:ac:classes:..."
                        value={value}
                        onValueChange={onChange}
                        isError={Boolean(error)}
                      />
                      <FieldDescription>
                        AuthnContextClassRef values counted as MFA, in addition to the standard
                        two-factor classes. Press Enter to add.
                      </FieldDescription>
                      <FieldError>{error?.message}</FieldError>
                    </Field>
                  )}
                />
              </FormSection>
            </div>
            <SheetFooter className="justify-between border-t">
              <div className="flex gap-2">
                <Button type="submit" variant="org" isPending={isPending}>
                  {!data?.isActive ? "Configure SAML" : "Update Configuration"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => handlePopUpClose("addSSO")}>
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
            <AlertDialogTitle>Delete SAML Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the SAML connection. Members will no longer be able to sign in via SAML
              until it&apos;s reconfigured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={handleSamlSoftDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
