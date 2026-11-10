import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { CodeBlock } from "@app/components/v4/ui/code-block";
import { Combobox } from "@app/components/v4/ui/combobox";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Textarea } from "@app/components/v4/ui/textarea";
import { SsoMfaTrust } from "@app/hooks/api/organization/types";

import { useOrgId } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { FormSection, rejectDuplicateTag } from "./form-section";

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
  entryPointHint?: string;
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
        entryPointHint: "IdP SSO URL",
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
        entryPointHint: "IdP SSO URL",
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

const providerMfaSignalAttribute = (authProvider: string) =>
  authProvider === AuthProvider.AZURE_SAML
    ? "http://schemas.microsoft.com/claims/authnmethodsreferences"
    : "amr";

const schema = z
  .object({
    authProvider: z.string().min(1, "SSO Type is required"),
    entryPoint: z.string().trim().min(1, "URL required"),
    issuer: z.string().trim().min(1, "Issuer required"),
    cert: z.string().default(""),
    mfaSignalAttribute: z.string().trim().max(512, "Attribute name is too long").default(""),
    mfaAuthnContexts: z
      .array(z.string().trim().min(1).max(512, "Context value is too long"))
      .max(20, "At most 20 contexts")
      .default([])
  })
  .required();

type AddSSOFormData = z.infer<typeof schema>;

const withHint = (label: string, hint?: string) => (hint ? `${label} (${hint})` : label);

export const SamlConfigDialog = ({
  open,
  onOpenChange,
  hideDelete
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hideDelete?: boolean;
}) => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const { data } = sso.useSamlConfig(orgId);
  const { data: organization } = useV4Adapter("org").useOrganization(orgId);
  const createConfig = sso.useCreateSamlConfig();
  const updateConfig = sso.useUpdateSamlConfig();
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [authnContextTagError, setAuthnContextTagError] = useState<string | null>(null);

  const { control, handleSubmit, reset, watch, setValue, getValues } = useForm<AddSSOFormData>({
    defaultValues: {
      authProvider: AuthProvider.OKTA_SAML,
      mfaSignalAttribute: "",
      mfaAuthnContexts: []
    },
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    if (data) {
      reset({
        authProvider: data.authProvider ?? "",
        entryPoint: data.entryPoint ?? "",
        issuer: data.issuer ?? "",
        cert: data.cert ?? "",
        mfaSignalAttribute: data.mfaSignalAttribute ?? "",
        mfaAuthnContexts: data.mfaAuthnContexts ?? []
      });
    }
  }, [data, open]);

  const authProvider = watch("authProvider");
  useEffect(() => {
    if (authProvider === AuthProvider.GOOGLE_SAML && getValues("issuer") === "") {
      setValue("issuer", window.origin);
    }
  }, [authProvider]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    reset();
    setAuthnContextTagError(null);
  };

  const handleSamlSoftDelete = async () => {
    setDeleting(true);
    try {
      await updateConfig.mutateAsync({
        organizationId: orgId,
        isActive: false,
        entryPoint: "",
        issuer: "",
        cert: "",
        mfaSignalAttribute: null,
        mfaAuthnContexts: null
      });
      saved("SAML SSO configuration deleted");
      setIsDeleteOpen(false);
    } catch (error) {
      failed("Failed to delete SAML SSO configuration", error);
    } finally {
      setDeleting(false);
    }
  };

  const onSubmit = async ({
    authProvider: provider,
    entryPoint,
    issuer,
    cert,
    mfaSignalAttribute,
    mfaAuthnContexts
  }: AddSSOFormData) => {
    const mfaSignal = {
      mfaSignalAttribute: mfaSignalAttribute || null,
      mfaAuthnContexts: mfaAuthnContexts.length > 0 ? mfaAuthnContexts : null
    };
    const payload = {
      organizationId: orgId,
      authProvider: provider,
      isActive: false,
      entryPoint,
      issuer,
      cert,
      ...mfaSignal
    };

    const isConnectionUnchanged =
      data?.isActive &&
      provider === data.authProvider &&
      entryPoint === data.entryPoint &&
      issuer === data.issuer &&
      cert === (data.cert ?? "");

    setPending(true);
    try {
      if (!data) {
        await createConfig.mutateAsync(payload);
      } else if (isConnectionUnchanged) {
        await updateConfig.mutateAsync({ organizationId: orgId, ...mfaSignal });
      } else {
        await updateConfig.mutateAsync(payload);
      }
      onOpenChange(false);
      saved(`SAML SSO configuration ${!data ? "added" : "updated"}`);
    } catch (error) {
      failed(`Failed to ${!data ? "add" : "update"} SAML SSO configuration`, error);
    } finally {
      setPending(false);
    }
  };

  const labels = providerLabels(authProvider);
  const provider = ssoAuthProviders.find((item) => item.value === authProvider);
  const providerName = provider?.name ?? "your IdP";
  const docsUrl = provider
    ? `${docsBaseUrl}/${provider.docsUrl}`
    : "https://infisical.com/docs/integrations/user-authentication";
  const isMfaSignalInUse = organization?.ssoMfaTrust === SsoMfaTrust.Signal;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent size="lg" pending={pending}>
          <form id="saml-config" noValidate onSubmit={handleSubmit(onSubmit)}>
            <SheetHeader>
              <SheetTitle>
                <Inline gap={8} wrap={false}>
                  Manage SAML configuration
                  <DocumentationLinkBadge href={docsUrl} />
                </Inline>
              </SheetTitle>
            </SheetHeader>
            <SheetBody>
              <Stack gap={32}>
                <FormSection
                  title="Identity provider"
                  description="Field names below match what your provider calls them."
                >
                  <Controller
                    control={control}
                    name="authProvider"
                    defaultValue="okta-saml"
                    render={({ field: { onChange, value }, fieldState: { error } }) => (
                      <Field label="Provider" error={error?.message}>
                        <Select
                          label="Provider"
                          placeholder="Select a provider"
                          options={ssoAuthProviders.map(({ name, value: providerValue }) => ({
                            value: providerValue,
                            label: name
                          }))}
                          value={value}
                          invalid={Boolean(error)}
                          onChange={onChange}
                        />
                      </Field>
                    )}
                  />
                </FormSection>

                {data && (
                  <FormSection
                    title={`Add Infisical to ${providerName}`}
                    description={`Copy these values into the SAML app you create in ${providerName}.`}
                  >
                    <CodeBlock
                      label={withHint(labels.acsUrl, labels.acsHint)}
                      code={`${window.origin}/api/v1/sso/saml2/${data.id}`}
                      copyLabel={`Copy ${labels.acsUrl}`}
                    />
                    <CodeBlock
                      label={withHint(labels.entityId, labels.entityHint)}
                      code={window.origin}
                      copyLabel={`Copy ${labels.entityId}`}
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
                      <Field
                        wide
                        label={withHint(labels.entryPoint, labels.entryPointHint)}
                        error={error?.message}
                      >
                        <Input
                          mono
                          placeholder={labels.entryPointPlaceholder}
                          autoComplete="off"
                          invalid={Boolean(error)}
                          {...field}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="issuer"
                    render={({ field, fieldState: { error } }) => (
                      <Field
                        wide
                        label={withHint(labels.issuer, labels.issuerHint)}
                        error={error?.message}
                      >
                        <Input
                          mono
                          placeholder={labels.issuerPlaceholder}
                          autoComplete="off"
                          invalid={Boolean(error)}
                          {...field}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="cert"
                    render={({ field, fieldState: { error } }) => (
                      <Field
                        wide
                        label="X.509 certificate"
                        optional
                        description={`Used to verify the signature on SAML responses from ${providerName}.`}
                        error={error?.message}
                      >
                        <Textarea
                          mono
                          rows={6}
                          placeholder="-----BEGIN CERTIFICATE----- ..."
                          {...field}
                        />
                      </Field>
                    )}
                  />
                </FormSection>

                <FormSection
                  title="MFA signal"
                  description="Read when Trust IdP MFA is on, to decide whether to skip the Infisical MFA prompt."
                  badge={isMfaSignalInUse ? <Badge tone="ok">In use</Badge> : undefined}
                >
                  <Controller
                    control={control}
                    name="mfaSignalAttribute"
                    render={({ field, fieldState: { error } }) => (
                      <Field
                        wide
                        label="MFA attribute name"
                        optional
                        description={`Attribute in the ${providerName} SAML assertion that lists the authentication methods the user completed. Leave empty to use the ${providerName} default.`}
                        error={error?.message}
                      >
                        <Input
                          mono
                          placeholder={providerMfaSignalAttribute(authProvider)}
                          autoComplete="off"
                          invalid={Boolean(error)}
                          {...field}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="mfaAuthnContexts"
                    render={({ field: { value, onChange }, fieldState: { error } }) => (
                      <Field
                        wide
                        label="Additional MFA authentication contexts"
                        optional
                        description="AuthnContextClassRef values counted as MFA, in addition to the standard two-factor classes. Press Enter to add."
                        error={authnContextTagError ?? error?.message}
                      >
                        <Combobox
                          multiple
                          mono
                          label="Additional MFA authentication contexts"
                          placeholder="urn:oasis:names:tc:SAML:2.0:ac:classes:..."
                          emptyText="Type a context and press Enter"
                          options={value.map((context) => ({ value: context, label: context }))}
                          value={value}
                          invalid={Boolean(authnContextTagError || error)}
                          onChange={(next) => {
                            onChange(next);
                            setAuthnContextTagError(null);
                          }}
                          onCreate={(query) => {
                            const tag = query.trim();
                            if (!tag) return;
                            const rejection = rejectDuplicateTag(tag, value);
                            if (rejection) {
                              setAuthnContextTagError(rejection);
                              return;
                            }
                            onChange([...value, tag]);
                            setAuthnContextTagError(null);
                          }}
                        />
                      </Field>
                    )}
                  />
                </FormSection>
              </Stack>
            </SheetBody>
            <SheetFooter>
              <Inline justify="between">
                <Inline gap={8}>
                  <Button type="submit" loading={pending}>
                    {!data?.isActive ? "Configure SAML" : "Update configuration"}
                  </Button>
                  <SheetClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </SheetClose>
                </Inline>
                {!hideDelete && (
                  <Button type="button" variant="destructive" onClick={() => setIsDeleteOpen(true)}>
                    Delete
                  </Button>
                )}
              </Inline>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent tone="danger" pending={deleting}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SAML configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the SAML connection. Members will no longer be able to sign in via SAML
              until it&apos;s reconfigured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" loading={deleting} onClick={handleSamlSoftDelete}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
