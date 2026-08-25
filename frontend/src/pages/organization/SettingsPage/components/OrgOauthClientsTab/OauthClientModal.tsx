import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Info } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Input,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  TextArea
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OauthGrantType,
  TOauthClient,
  useCreateOauthClient,
  useGetOIDCConfig,
  useUpdateOauthClient
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

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

type Props = {
  popUp: UsePopUpState<["clientForm"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["clientForm"]>) => void;
  onCreated?: (client: TOauthClient, clientSecret: string) => void;
};

export const OauthClientModal = ({ popUp, handlePopUpClose, onCreated }: Props) => {
  const isSheetOpen = Boolean(popUp?.clientForm?.isOpen);
  const [editingClient, setEditingClient] = useState<TOauthClient | undefined>();
  const isEditing = Boolean(editingClient);

  const { currentOrg } = useOrganization();
  const { data: oidcConfig, isPending: isOidcConfigPending } = useGetOIDCConfig(
    currentOrg?.id ?? ""
  );
  const hasActiveOidcSso = Boolean(oidcConfig?.isActive);

  const { control, handleSubmit, reset } = useForm<TOauthClientForm>({
    resolver: zodResolver(oauthClientFormSchema),
    defaultValues: {
      name: "",
      description: "",
      flow: OauthClientFlow.AuthorizationCode,
      redirectUris: "",
      requirePkce: false,
      accessTokenTtlValue: secondsToTtl(DEFAULT_ACCESS_TOKEN_TTL_SECONDS).value,
      accessTokenTtlUnit: secondsToTtl(DEFAULT_ACCESS_TOKEN_TTL_SECONDS).unit,
      tokenExchangeAudience: "",
      tokenExchangeIdpSatisfiesMfa: false
    }
  });

  const flow = useWatch({ control, name: "flow" });
  const isMissingOidcSso =
    flow === OauthClientFlow.TokenExchange && !isOidcConfigPending && !hasActiveOidcSso;

  useEffect(() => {
    if (!isSheetOpen) return;

    const client = popUp?.clientForm?.data as TOauthClient | undefined;
    setEditingClient(client);
    reset({
      name: client?.name ?? "",
      description: client?.description ?? "",
      flow: client?.grantTypes?.includes(OauthGrantType.TokenExchange)
        ? OauthClientFlow.TokenExchange
        : OauthClientFlow.AuthorizationCode,
      redirectUris: client?.redirectUris?.join("\n") ?? "",
      requirePkce: client?.requirePkce ?? false,
      accessTokenTtlValue: secondsToTtl(client?.accessTokenTTL ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS)
        .value,
      accessTokenTtlUnit: secondsToTtl(client?.accessTokenTTL ?? DEFAULT_ACCESS_TOKEN_TTL_SECONDS)
        .unit,
      tokenExchangeAudience: client?.tokenExchangeAudience ?? "",
      tokenExchangeIdpSatisfiesMfa: client?.tokenExchangeIdpSatisfiesMfa ?? false
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSheetOpen]);

  const { mutateAsync: createOauthClient, isPending: isCreating } = useCreateOauthClient();
  const { mutateAsync: updateOauthClient, isPending: isUpdating } = useUpdateOauthClient();

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
      if (isEditing && editingClient) {
        await updateOauthClient({
          ...payload,
          clientDbId: editingClient.id,
          description: form.description || null,
          tokenExchangeAudience: isTokenExchange ? form.tokenExchangeAudience : null
        });
        createNotification({
          text: "Successfully updated OAuth application",
          type: "success"
        });
      } else {
        const { client, clientSecret } = await createOauthClient({
          ...payload,
          description: form.description || undefined,
          tokenExchangeAudience: isTokenExchange ? form.tokenExchangeAudience : undefined
        });
        createNotification({
          text: "Successfully created OAuth application",
          type: "success"
        });
        onCreated?.(client, clientSecret);
      }
      handlePopUpClose("clientForm");
      reset();
    } catch {
      // Reported by the mutation cache's global onError.
    }
  };

  return (
    <Sheet
      open={popUp?.clientForm?.isOpen}
      onOpenChange={(isOpen) => {
        if (isOpen) return;
        handlePopUpClose("clientForm");
        reset();
      }}
    >
      <SheetContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex h-full min-h-0 flex-col">
          <SheetHeader>
            <SheetTitle>
              {isEditing ? "Edit OAuth application" : "Add OAuth application"}
            </SheetTitle>
            <SheetDescription>
              External platforms use this application to request delegated access to Infisical on a
              user&apos;s behalf via OAuth 2.0, limited to that user&apos;s permissions.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 thin-scrollbar flex-1 overflow-y-auto p-4">
            <FieldGroup>
              <Controller
                control={control}
                name="name"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="oauth-client-name">Name</FieldLabel>
                    <Input
                      id="oauth-client-name"
                      placeholder="e.g. Coder"
                      isError={Boolean(error)}
                      {...field}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="description"
                render={({ field, fieldState: { error } }) => (
                  <Field>
                    <FieldLabel htmlFor="oauth-client-description">
                      Description (optional)
                    </FieldLabel>
                    <Input
                      id="oauth-client-description"
                      placeholder="What this application is used for"
                      isError={Boolean(error)}
                      {...field}
                    />
                    <FieldError>{error?.message}</FieldError>
                  </Field>
                )}
              />
              <Field>
                <div className="flex gap-4">
                  <Controller
                    control={control}
                    name="accessTokenTtlValue"
                    render={({ field, fieldState: { error } }) => (
                      <Field className="flex-1">
                        <FieldLabel htmlFor="oauth-client-access-token-ttl-value">
                          Access token lifetime
                        </FieldLabel>
                        <Input
                          {...field}
                          id="oauth-client-access-token-ttl-value"
                          type="number"
                          min={1}
                          step={1}
                          value={field.value}
                          onChange={(e) => field.onChange(parseInt(e.target.value, 10))}
                          isError={Boolean(error)}
                        />
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="accessTokenTtlUnit"
                    render={({ field, fieldState: { error } }) => (
                      <Field className="flex-1">
                        <FieldLabel htmlFor="oauth-client-access-token-ttl-unit">
                          Time unit
                        </FieldLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger
                            id="oauth-client-access-token-ttl-unit"
                            className="w-full"
                            isError={Boolean(error)}
                          >
                            <SelectValue placeholder="Select time unit" />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            {TTL_UNITS.map(({ value, label }) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                </div>
                <FieldDescription>
                  How long tokens issued to this application stay valid. Your organization&apos;s
                  session length still applies, so the shorter of the two wins.
                </FieldDescription>
              </Field>
              <Controller
                control={control}
                name="flow"
                render={({ field: { value, onChange } }) => (
                  <Field>
                    <FieldLabel>Flow</FieldLabel>
                    <RadioGroup value={value} onValueChange={onChange} aria-label="Flow">
                      {FLOW_OPTIONS.map((option) => (
                        <FieldLabel
                          key={option.value}
                          htmlFor={`oauth-client-flow-${option.value}`}
                          variant="org"
                        >
                          <Field orientation="horizontal">
                            <FieldContent>
                              <FieldTitle className="gap-1.5">
                                {option.title}
                                <span className="font-normal text-muted">({option.rfc})</span>
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
                <Alert variant={hasActiveOidcSso ? "default" : "warning"}>
                  {hasActiveOidcSso ? <Info /> : <AlertTriangle />}
                  <AlertDescription className="text-xs">
                    {hasActiveOidcSso ? (
                      <p>
                        User tokens are verified against the OIDC SSO issuer configured under{" "}
                        <Link
                          to="/organizations/$orgId/sso"
                          params={{ orgId: currentOrg?.id ?? "" }}
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          Settings &gt; SSO & Provisioning
                        </Link>
                        . Disabling OIDC SSO stops token exchange working.
                      </p>
                    ) : (
                      <p>
                        Token exchange verifies user tokens against your organization&apos;s OIDC
                        SSO issuer. Set one up under{" "}
                        <Link
                          to="/organizations/$orgId/sso"
                          params={{ orgId: currentOrg?.id ?? "" }}
                          className="underline underline-offset-2 hover:text-foreground"
                        >
                          Settings &gt; SSO & Provisioning
                        </Link>{" "}
                        first.
                      </p>
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
                      <Field>
                        <FieldLabel htmlFor="oauth-client-redirect-uris">Redirect URIs</FieldLabel>
                        <TextArea
                          id="oauth-client-redirect-uris"
                          placeholder="https://coder.example.com/external-auth/infisical/callback"
                          rows={3}
                          {...field}
                        />
                        <FieldDescription>
                          One URI per line. The authorization flow only redirects to these exact
                          URIs.
                        </FieldDescription>
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="requirePkce"
                    render={({ field: { value, onChange } }) => (
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>Require PKCE (S256)</FieldTitle>
                          <FieldDescription>
                            Reject authorization requests that do not include a PKCE code challenge.
                          </FieldDescription>
                        </FieldContent>
                        <Switch
                          id="oauth-client-require-pkce"
                          variant="org"
                          checked={value}
                          onCheckedChange={onChange}
                        />
                      </Field>
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
                      <Field>
                        <FieldLabel htmlFor="oauth-client-token-exchange-audience">
                          Audience
                        </FieldLabel>
                        <Input
                          id="oauth-client-token-exchange-audience"
                          placeholder="e.g. api://internal-mcp"
                          isError={Boolean(error)}
                          {...field}
                        />
                        <FieldDescription>
                          The audience your identity provider puts in tokens it issues for this
                          application.
                        </FieldDescription>
                        <FieldError>{error?.message}</FieldError>
                      </Field>
                    )}
                  />
                  <Controller
                    control={control}
                    name="tokenExchangeIdpSatisfiesMfa"
                    render={({ field: { value, onChange } }) => (
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>Identity provider enforces MFA</FieldTitle>
                          <FieldDescription>
                            Token exchange has no Infisical MFA challenge to run. Turn this on to
                            declare that your identity provider already enforces MFA.
                          </FieldDescription>
                        </FieldContent>
                        <Switch
                          id="oauth-client-token-exchange-idp-mfa"
                          variant="org"
                          checked={value}
                          onCheckedChange={onChange}
                        />
                      </Field>
                    )}
                  />
                </>
              )}
            </FieldGroup>
          </div>
          <SheetFooter className="justify-end border-t">
            <Button variant="ghost" type="button" onClick={() => handlePopUpClose("clientForm")}>
              Cancel
            </Button>
            <Button
              variant="org"
              type="submit"
              isPending={isCreating || isUpdating}
              isDisabled={isCreating || isUpdating || isMissingOidcSso}
            >
              {isEditing ? "Save Changes" : "Create Application"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
