import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { z } from "zod";

import { Alert, AlertDescription } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle
} from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Grid, Stack } from "@app/components/v4/ui/layout";
import { RadioGroup, RadioGroupItem } from "@app/components/v4/ui/radio-group";
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
import { OauthGrantType, type TOauthClient } from "@app/hooks/api/oauthClients/types";

import { useOrgId } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";

import styles from "./oauth-applications.module.css";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const isValidRedirectUri = (uri: string) => {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol === "http:") {
      return LOOPBACK_HOSTNAMES.has(parsed.hostname.replace(/^\[|\]$/g, ""));
    }
    return false;
  } catch {
    return false;
  }
};

const splitRedirectUris = (value: string) =>
  value
    .split("\n")
    .map((uri) => uri.trim())
    .filter(Boolean);

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 86400;
const MIN_ACCESS_TOKEN_TTL_SECONDS = 60;
const MAX_ACCESS_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

const TTL_UNITS = [
  { value: "s", label: "Seconds", seconds: 1 },
  { value: "m", label: "Minutes", seconds: 60 },
  { value: "h", label: "Hours", seconds: 60 * 60 },
  { value: "d", label: "Days", seconds: 24 * 60 * 60 },
  { value: "w", label: "Weeks", seconds: 7 * 24 * 60 * 60 }
] as const;

type TTtlUnit = (typeof TTL_UNITS)[number]["value"];

const TTL_UNIT_VALUES = TTL_UNITS.map(({ value }) => value) as [TTtlUnit, ...TTtlUnit[]];

const ttlToSeconds = (value: number, unit: TTtlUnit) =>
  value * (TTL_UNITS.find((entry) => entry.value === unit)?.seconds ?? 1);

const secondsToTtl = (totalSeconds: number): { value: number; unit: TTtlUnit } => {
  const unit =
    [...TTL_UNITS].reverse().find((entry) => totalSeconds % entry.seconds === 0) ?? TTL_UNITS[0];
  return { value: totalSeconds / unit.seconds, unit: unit.value };
};

// The API lets a client hold several grants, but the UI sticks to one flow per application: the two
// share no config and delegate differently, so an application needing both goes through the API.
enum OauthClientFlow {
  AuthorizationCode = "authorization-code",
  TokenExchange = "token-exchange"
}

const oauthClientFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(64),
    description: z.string().trim().max(256).optional(),
    flow: z.nativeEnum(OauthClientFlow),
    redirectUris: z.string().trim(),
    requirePkce: z.boolean(),
    accessTokenTtlValue: z
      .number({ invalid_type_error: "A lifetime value is required" })
      .int()
      .min(1, "Value must be at least 1"),
    accessTokenTtlUnit: z.enum(TTL_UNIT_VALUES, {
      invalid_type_error: "Please select a valid time unit"
    }),
    tokenExchangeAudience: z.string().trim().max(255),
    tokenExchangeIdpSatisfiesMfa: z.boolean()
  })
  .superRefine((data, ctx) => {
    if (data.flow === OauthClientFlow.AuthorizationCode) {
      const uris = splitRedirectUris(data.redirectUris);

      if (!uris.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["redirectUris"],
          message: "At least one redirect URI is required"
        });
      }

      const invalidUri = uris.find((uri) => !isValidRedirectUri(uri));
      if (invalidUri) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["redirectUris"],
          message: `Invalid redirect URI: ${invalidUri}`
        });
      }
    }

    const ttlSeconds = ttlToSeconds(data.accessTokenTtlValue, data.accessTokenTtlUnit);
    if (ttlSeconds < MIN_ACCESS_TOKEN_TTL_SECONDS || ttlSeconds > MAX_ACCESS_TOKEN_TTL_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["accessTokenTtlValue"],
        message: "Access token lifetime must be between 1 minute and 90 days"
      });
    }

    if (data.flow === OauthClientFlow.TokenExchange && !data.tokenExchangeAudience) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tokenExchangeAudience"],
        message: "An audience is required"
      });
    }
  });

type TOauthClientForm = z.infer<typeof oauthClientFormSchema>;

const FLOW_OPTIONS = [
  {
    value: OauthClientFlow.AuthorizationCode,
    title: "Authorization code",
    rfc: "RFC 6749",
    description:
      "The user signs in and approves the application in their browser. The token is limited to the scopes they consent to."
  },
  {
    value: OauthClientFlow.TokenExchange,
    title: "Token exchange",
    rfc: "RFC 8693",
    description:
      "The application presents a user's token from your identity provider and receives that user's Infisical token. No browser and no consent screen, and the token carries that user's full permissions."
  }
] as const;

const toFormValues = (client?: TOauthClient): TOauthClientForm => {
  const ttl = secondsToTtl(client?.accessTokenTTL ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS);
  return {
    name: client?.name ?? "",
    description: client?.description ?? "",
    flow: client?.grantTypes?.includes(OauthGrantType.TokenExchange)
      ? OauthClientFlow.TokenExchange
      : OauthClientFlow.AuthorizationCode,
    redirectUris: client?.redirectUris?.join("\n") ?? "",
    requirePkce: client?.requirePkce ?? false,
    accessTokenTtlValue: ttl.value,
    accessTokenTtlUnit: ttl.unit,
    tokenExchangeAudience: client?.tokenExchangeAudience ?? "",
    tokenExchangeIdpSatisfiesMfa: client?.tokenExchangeIdpSatisfiesMfa ?? false
  };
};

export const OauthClientSheet = ({
  open,
  client,
  onOpenChange,
  onCreated
}: {
  open: boolean;
  client?: TOauthClient;
  onOpenChange: (open: boolean) => void;
  onCreated: (client: TOauthClient, clientSecret: string) => void;
}) => {
  const orgId = useOrgId();
  const sso = useV4Adapter("sso");
  const { data: oidcConfig, isPending: isOidcConfigPending } = sso.useOidcConfig(orgId);
  const hasActiveOidcSso = Boolean(oidcConfig?.isActive);
  const createOauthClient = sso.useCreateOauthClient();
  const updateOauthClient = sso.useUpdateOauthClient();
  const isEditing = Boolean(client);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<TOauthClientForm>({
    resolver: zodResolver(oauthClientFormSchema),
    defaultValues: toFormValues()
  });

  const flow = useWatch({ control, name: "flow" });
  const isMissingOidcSso =
    flow === OauthClientFlow.TokenExchange && !isOidcConfigPending && !hasActiveOidcSso;

  useEffect(() => {
    if (open) reset(toFormValues(client));
  }, [open]);

  const onFormSubmit = async (form: TOauthClientForm) => {
    const isTokenExchange = form.flow === OauthClientFlow.TokenExchange;

    const payload = {
      name: form.name,
      grantTypes: isTokenExchange
        ? [OauthGrantType.TokenExchange]
        : [OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken],
      redirectUris: isTokenExchange ? [] : splitRedirectUris(form.redirectUris),
      requirePkce: isTokenExchange ? false : form.requirePkce,
      accessTokenTTL: ttlToSeconds(form.accessTokenTtlValue, form.accessTokenTtlUnit),
      tokenExchangeIdpSatisfiesMfa: isTokenExchange ? form.tokenExchangeIdpSatisfiesMfa : false
    };

    try {
      if (client) {
        await updateOauthClient.mutateAsync({
          ...payload,
          clientDbId: client.id,
          description: form.description || null,
          tokenExchangeAudience: isTokenExchange ? form.tokenExchangeAudience : null
        });
        saved("Successfully updated OAuth application");
      } else {
        const created = await createOauthClient.mutateAsync({
          ...payload,
          description: form.description || undefined,
          tokenExchangeAudience: isTokenExchange ? form.tokenExchangeAudience : undefined
        });
        saved("Successfully created OAuth application");
        onCreated(created.client, created.clientSecret);
      }
      onOpenChange(false);
      reset();
    } catch (error) {
      failed(
        client ? "Failed to update OAuth application" : "Failed to create OAuth application",
        error
      );
    }
  };

  const ssoLink = (
    <Button variant="link" underline="hover" asChild>
      <Link to={v4Path("/organizations/$orgId/sso")} params={{ orgId }}>
        SSO & provisioning
      </Link>
    </Button>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <SheetContent size="md" pending={isSubmitting}>
        <form noValidate onSubmit={handleSubmit(onFormSubmit)}>
          <SheetHeader>
            <SheetTitle>
              {isEditing ? "Edit OAuth application" : "Add OAuth application"}
            </SheetTitle>
          </SheetHeader>
          <SheetBody>
            <Stack gap={24}>
              <Controller
                control={control}
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <Field label="Name" error={error?.message} wide>
                    <Input
                      {...field}
                      placeholder="e.g. Coder"
                      autoComplete="off"
                      invalid={Boolean(error)}
                    />
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="description"
                render={({ field, fieldState: { error } }) => (
                  <Field label="Description" optional error={error?.message} wide>
                    <Input
                      {...field}
                      placeholder="What this application is used for"
                      invalid={Boolean(error)}
                    />
                  </Field>
                )}
              />
              <Stack gap={8}>
                <Grid columns={2} gap={16}>
                  <Controller
                    control={control}
                    name="accessTokenTtlValue"
                    render={({ field, fieldState: { error } }) => (
                      <Field label="Access token lifetime" error={error?.message} wide>
                        <Input
                          {...field}
                          type="number"
                          min={1}
                          step={1}
                          value={Number.isNaN(field.value) ? "" : field.value}
                          onChange={(event) => field.onChange(parseInt(event.target.value, 10))}
                          invalid={Boolean(error)}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="accessTokenTtlUnit"
                    render={({ field, fieldState: { error } }) => (
                      <Field label="Time unit" error={error?.message} wide>
                        <Select
                          placeholder="Select time unit"
                          options={TTL_UNITS.map(({ value, label }) => ({ value, label }))}
                          value={field.value}
                          onChange={(value) => field.onChange(value as TTtlUnit)}
                          invalid={Boolean(error)}
                        />
                      </Field>
                    )}
                  />
                </Grid>
                <FieldDescription>
                  How long tokens issued to this application stay valid. Your organization&apos;s
                  session length still applies, so the shorter of the two wins.
                </FieldDescription>
              </Stack>
              <Controller
                control={control}
                name="flow"
                render={({ field: { value, onChange } }) => (
                  <Field label="Flow" group wide>
                    <RadioGroup value={value} onValueChange={onChange} aria-label="Flow">
                      {FLOW_OPTIONS.map((option) => (
                        <FieldLabel
                          key={option.value}
                          htmlFor={`oauth-client-flow-${option.value}`}
                        >
                          <Field orientation="horizontal">
                            <FieldContent>
                              <FieldTitle>
                                {option.title}
                                <span className={styles.rfc}>{option.rfc}</span>
                              </FieldTitle>
                              <FieldDescription>{option.description}</FieldDescription>
                            </FieldContent>
                            <RadioGroupItem
                              id={`oauth-client-flow-${option.value}`}
                              value={option.value}
                            />
                          </Field>
                        </FieldLabel>
                      ))}
                    </RadioGroup>
                  </Field>
                )}
              />
              {flow === OauthClientFlow.TokenExchange && !isOidcConfigPending && (
                <Alert tone={hasActiveOidcSso ? "info" : "warn"}>
                  <Icon name={hasActiveOidcSso ? "info" : "alert"} />
                  <AlertDescription>
                    {hasActiveOidcSso ? (
                      <>
                        User tokens are verified against the OIDC SSO issuer configured under{" "}
                        {ssoLink}. Disabling OIDC SSO stops token exchange working.
                      </>
                    ) : (
                      <>
                        Token exchange verifies user tokens against your organization&apos;s OIDC
                        SSO issuer. Set one up under {ssoLink} first.
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {flow === OauthClientFlow.AuthorizationCode && (
                <>
                  <Controller
                    control={control}
                    name="redirectUris"
                    render={({ field, fieldState: { error } }) => (
                      <Field
                        label="Redirect URIs"
                        description="One URI per line. The authorization flow only redirects to these exact URIs."
                        error={error?.message}
                        wide
                      >
                        <Textarea
                          {...field}
                          mono
                          rows={3}
                          placeholder="https://coder.example.com/external-auth/infisical/callback"
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="requirePkce"
                    render={({ field: { value, onChange } }) => (
                      <Checkbox
                        label="Require PKCE (S256)"
                        description="Reject authorization requests that do not include a PKCE code challenge."
                        checked={value}
                        onCheckedChange={(checked) => onChange(checked === true)}
                      />
                    )}
                  />
                </>
              )}
              {flow === OauthClientFlow.TokenExchange && !isMissingOidcSso && (
                <>
                  <Controller
                    control={control}
                    name="tokenExchangeAudience"
                    render={({ field, fieldState: { error } }) => (
                      <Field
                        label="Audience"
                        description="The audience your identity provider puts in tokens it issues for this application."
                        error={error?.message}
                        wide
                      >
                        <Input
                          {...field}
                          mono
                          placeholder="e.g. api://internal-mcp"
                          invalid={Boolean(error)}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="tokenExchangeIdpSatisfiesMfa"
                    render={({ field: { value, onChange } }) => (
                      <Checkbox
                        label="Identity provider enforces MFA"
                        description="Token exchange has no Infisical MFA challenge to run. Turn this on to declare that your identity provider already enforces MFA."
                        checked={value}
                        onCheckedChange={(checked) => onChange(checked === true)}
                      />
                    )}
                  />
                </>
              )}
            </Stack>
          </SheetBody>
          <SheetFooter>
            <Button
              type="submit"
              loading={isSubmitting}
              disabledReason={
                isMissingOidcSso ? "Token exchange needs OIDC SSO set up first" : undefined
              }
            >
              {isEditing ? "Save changes" : "Create application"}
            </Button>
            <SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
