import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Code } from "@app/components/v4/ui/code";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { Field, FieldDescription, FieldError, FieldLabel } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { SecretInput } from "@app/components/v4/ui/secret-input";
import { Select } from "@app/components/v4/ui/select";
import { Tabs } from "@app/components/v4/ui/tabs";
import { OIDCJWTSignatureAlgorithm } from "@app/hooks/api/oidcConfig/types";
import type { OIDCConfigData } from "@app/hooks/api/oidcConfig/types";
import { SsoMfaTrust } from "@app/hooks/api/organization/types";

import { useOrgId } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { DialogSection, rejectDuplicateTag, TagsField } from "./dialog-parts";

enum ConfigurationType {
  CUSTOM = "custom",
  DISCOVERY_URL = "discoveryURL"
}

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

type OIDCFormData = z.infer<typeof schema>;

const ALGORITHM_OPTIONS = [
  { value: OIDCJWTSignatureAlgorithm.RS256, label: "RS256" },
  { value: OIDCJWTSignatureAlgorithm.RS512, label: "RS512" },
  { value: OIDCJWTSignatureAlgorithm.HS256, label: "HS256" },
  { value: OIDCJWTSignatureAlgorithm.EDDSA, label: "EdDSA" }
];

const defaults: OIDCFormData = {
  configurationType: ConfigurationType.DISCOVERY_URL,
  clientId: "",
  jwtSignatureAlgorithm: OIDCJWTSignatureAlgorithm.RS256,
  mfaClaimName: "amr",
  mfaAmrValues: []
};

// The stored secret never returns to the form; a blank field on update keeps it.
const toFormValues = (data: OIDCConfigData | null | undefined): OIDCFormData =>
  data
    ? {
        issuer: data.issuer,
        authorizationEndpoint: data.authorizationEndpoint,
        jwksUri: data.jwksUri,
        tokenEndpoint: data.tokenEndpoint,
        userinfoEndpoint: data.userinfoEndpoint,
        discoveryURL: data.discoveryURL,
        clientId: data.clientId,
        clientSecret: "",
        allowedEmailDomains: data.allowedEmailDomains ?? "",
        configurationType: data.configurationType,
        jwtSignatureAlgorithm: data.jwtSignatureAlgorithm,
        mfaClaimName: data.mfaClaimName || "amr",
        mfaAmrValues: data.mfaAmrValues ?? []
      }
    : defaults;

export const OidcConfigDialog = ({
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
  const { data: org } = useV4Adapter("org").useOrganization(orgId);
  const { data } = sso.useOidcConfig(orgId);
  const create = sso.useCreateOidcConfig();
  const update = sso.useUpdateOidcConfig();
  const formId = useId();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [amrValueTagError, setAmrValueTagError] = useState<string | null>(null);

  const { control, handleSubmit, reset, setError, watch } = useForm<OIDCFormData>({
    resolver: zodResolver(schema),
    defaultValues: defaults
  });

  useEffect(() => {
    if (open) {
      reset(toFormValues(data));
      setAmrValueTagError(null);
    }
  }, [data, open]);

  const configurationTypeValue = watch("configurationType");
  const isExistingConfig = Boolean(data?.isActive);
  const hasStoredSecret = Boolean(data?.clientSecret);
  const isPending = create.isPending || update.isPending;
  const isMfaSignalInUse = org?.ssoMfaTrust === SsoMfaTrust.Signal;

  const handleOidcSoftDelete = async () => {
    try {
      await update.mutateAsync({
        issuer: "",
        discoveryURL: "",
        authorizationEndpoint: "",
        allowedEmailDomains: "",
        jwksUri: "",
        tokenEndpoint: "",
        userinfoEndpoint: "",
        clientId: "",
        clientSecret: "",
        mfaClaimName: "amr",
        mfaAmrValues: null,
        isActive: false,
        organizationId: orgId
      });
      saved("Successfully deleted OIDC configuration");
    } catch (error) {
      failed("Failed to delete OIDC configuration", error);
    }
  };

  const onSubmit = async ({
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
      organizationId: orgId,
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

    try {
      if (!data) {
        await create.mutateAsync({ ...payload, clientSecret: clientSecret as string });
      } else if (isConnectionUnchanged) {
        await update.mutateAsync({ organizationId: orgId, ...mfaSignal });
      } else {
        await update.mutateAsync({ ...payload, ...(clientSecret ? { clientSecret } : {}) });
      }
      onOpenChange(false);
      saved(`Successfully ${data?.isActive ? "updated" : "added"} OIDC SSO configuration`);
    } catch (error) {
      failed(`Failed to ${data?.isActive ? "update" : "add"} OIDC SSO configuration`, error);
    }
  };

  const urlField = (
    name: "issuer" | "authorizationEndpoint" | "tokenEndpoint" | "jwksUri" | "userinfoEndpoint",
    label: string,
    placeholder: string
  ) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Field label={label} error={error?.message}>
          <Input
            mono
            placeholder={placeholder}
            autoComplete="off"
            invalid={Boolean(error)}
            {...field}
            value={field.value ?? ""}
          />
        </Field>
      )}
    />
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent pending={isPending}>
          <DialogHeader>
            <DialogTitle>
              <Inline gap={8}>
                Manage OIDC configuration
                <DocumentationLinkBadge href="https://infisical.com/docs/integrations/user-authentication" />
              </Inline>
            </DialogTitle>
          </DialogHeader>
          <form id={formId} noValidate onSubmit={handleSubmit(onSubmit)}>
            <Stack gap={24}>
              <DialogSection title="Identity provider">
                <Controller
                  control={control}
                  name="configurationType"
                  render={({ field: { onChange, value } }) => (
                    <Field label="Configuration type" group>
                      <Tabs
                        variant="segmented"
                        label="Configuration type"
                        value={value}
                        onChange={onChange}
                        tabs={[
                          { value: ConfigurationType.DISCOVERY_URL, label: "Discovery URL" },
                          { value: ConfigurationType.CUSTOM, label: "Custom endpoints" }
                        ]}
                      />
                    </Field>
                  )}
                />
                {configurationTypeValue === ConfigurationType.DISCOVERY_URL && (
                  <Controller
                    control={control}
                    name="discoveryURL"
                    render={({ field, fieldState: { error } }) => (
                      <Field label="Discovery document URL" error={error?.message}>
                        <Input
                          mono
                          placeholder="https://idp.example.com/.well-known/openid-configuration"
                          autoComplete="off"
                          invalid={Boolean(error)}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </Field>
                    )}
                  />
                )}
                {configurationTypeValue === ConfigurationType.CUSTOM && (
                  <>
                    {urlField("issuer", "Issuer", "https://idp.example.com")}
                    {urlField(
                      "authorizationEndpoint",
                      "Authorization endpoint",
                      "https://idp.example.com/authorize"
                    )}
                    {urlField("tokenEndpoint", "Token endpoint", "https://idp.example.com/token")}
                    {urlField("jwksUri", "JWKS URI", "https://idp.example.com/jwks")}
                    {urlField(
                      "userinfoEndpoint",
                      "Userinfo endpoint",
                      "https://idp.example.com/userinfo"
                    )}
                  </>
                )}
                <Controller
                  control={control}
                  name="jwtSignatureAlgorithm"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field label="JWT signature algorithm" error={error?.message}>
                      <Select
                        aria-label="JWT signature algorithm"
                        placeholder="Select algorithm"
                        options={ALGORITHM_OPTIONS}
                        value={value}
                        invalid={Boolean(error)}
                        onChange={(next) => onChange(next as OIDCJWTSignatureAlgorithm)}
                      />
                    </Field>
                  )}
                />
              </DialogSection>

              <DialogSection
                title="Client credentials"
                description="From the OIDC client you registered for Infisical in your IdP."
              >
                <Controller
                  control={control}
                  name="clientId"
                  render={({ field, fieldState: { error } }) => (
                    <Field label="Client ID" error={error?.message}>
                      <Input
                        mono
                        placeholder="infisical-web"
                        autoComplete="off"
                        invalid={Boolean(error)}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="clientSecret"
                  render={({ field, fieldState: { error } }) => (
                    <Field
                      label="Client secret"
                      error={error?.message}
                      description={
                        hasStoredSecret ? "Leave blank to keep the current secret." : undefined
                      }
                    >
                      <SecretInput
                        placeholder={
                          hasStoredSecret
                            ? "Stored. Enter a new value to replace it."
                            : "Client secret"
                        }
                        autoComplete="new-password"
                        invalid={Boolean(error)}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </Field>
                  )}
                />
              </DialogSection>

              <DialogSection
                title="Access"
                description="Limit which users can sign in through this IdP."
              >
                <Controller
                  control={control}
                  name="allowedEmailDomains"
                  render={({ field, fieldState: { error } }) => (
                    <Field
                      label="Allowed email domains"
                      optional
                      error={error?.message}
                      description="Any domain is allowed if empty. Supports wildcards, e.g. *.example.com."
                    >
                      <Input
                        mono
                        placeholder="infisical.com, *.google.com"
                        autoComplete="off"
                        invalid={Boolean(error)}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </Field>
                  )}
                />
              </DialogSection>

              <DialogSection
                title="MFA signal"
                description="Read when Trust IdP MFA is on, to decide whether to skip the Infisical MFA prompt."
                badge={isMfaSignalInUse ? <Badge tone="ok">In use</Badge> : undefined}
              >
                <Controller
                  control={control}
                  name="mfaClaimName"
                  render={({ field, fieldState: { error } }) => (
                    <Field
                      label="MFA claim name"
                      error={error?.message}
                      description="ID token claim listing the authentication methods the user completed."
                    >
                      <Input
                        mono
                        placeholder="amr"
                        autoComplete="off"
                        invalid={Boolean(error)}
                        {...field}
                      />
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="mfaAmrValues"
                  render={({ field: { value, onChange }, fieldState: { error } }) => {
                    const message = amrValueTagError ?? error?.message;
                    return (
                      <Field>
                        <FieldLabel htmlFor={`${formId}-amr`}>
                          Additional MFA claim values (optional)
                        </FieldLabel>
                        <TagsField
                          id={`${formId}-amr`}
                          label="Additional MFA claim values"
                          placeholder="Type a value, then create it"
                          value={value ?? []}
                          onChange={onChange}
                          validate={rejectDuplicateTag}
                          onValidationError={setAmrValueTagError}
                          invalid={Boolean(message)}
                        />
                        {message ? (
                          <FieldError>{message}</FieldError>
                        ) : (
                          <FieldDescription>
                            Counted as MFA in addition to the standard <Code>mfa</Code> value.
                          </FieldDescription>
                        )}
                      </Field>
                    );
                  }}
                />
              </DialogSection>
            </Stack>
          </form>
          <DialogFooter>
            {!hideDelete && (
              <div className="mr-auto">
                <Button variant="danger-ghost" onClick={() => setIsDeleteOpen(true)}>
                  Delete
                </Button>
              </div>
            )}
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit" form={formId} loading={isPending}>
              {isExistingConfig ? "Update configuration" : "Configure OIDC"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete OIDC configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the OIDC connection. Members will no longer be able to sign in via OIDC
              until it&apos;s reconfigured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleOidcSoftDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
