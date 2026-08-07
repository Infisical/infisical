import { useEffect } from "react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
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

// The UI models one flow per application even though the API allows a client to hold several grants.
// The two flows share no configuration and delegate differently, so an application needing both is a
// direct API call.
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

    if (data.flow === OauthClientFlow.TokenExchange && !data.tokenExchangeAudience) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tokenExchangeAudience"],
        message: "An audience is required"
      });
    }
  });

type TOauthClientForm = z.infer<typeof oauthClientFormSchema>;

const FLOW_DESCRIPTIONS: Record<OauthClientFlow, string> = {
  [OauthClientFlow.AuthorizationCode]:
    "RFC 6749. The user signs in and approves the application in their browser. The token is limited to the scopes they consent to.",
  [OauthClientFlow.TokenExchange]:
    "RFC 8693. The application presents a user's token from your identity provider and receives that user's Infisical token. No browser and no consent screen, and the token carries that user's full permissions."
};

type Props = {
  popUp: UsePopUpState<["clientForm"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["clientForm"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["clientForm"]>, state?: boolean) => void;
  onCreated?: (client: TOauthClient, clientSecret: string) => void;
};

export const OauthClientModal = ({
  popUp,
  handlePopUpClose,
  handlePopUpToggle,
  onCreated
}: Props) => {
  const editingClient = popUp?.clientForm?.data as TOauthClient | undefined;
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
      tokenExchangeAudience: "",
      tokenExchangeIdpSatisfiesMfa: false
    }
  });

  const flow = useWatch({ control, name: "flow" });

  useEffect(() => {
    if (popUp?.clientForm?.isOpen) {
      reset({
        name: editingClient?.name ?? "",
        description: editingClient?.description ?? "",
        flow: editingClient?.grantTypes?.includes(OauthGrantType.TokenExchange)
          ? OauthClientFlow.TokenExchange
          : OauthClientFlow.AuthorizationCode,
        redirectUris: editingClient?.redirectUris?.join("\n") ?? "",
        requirePkce: editingClient?.requirePkce ?? false,
        tokenExchangeAudience: editingClient?.tokenExchangeAudience ?? "",
        tokenExchangeIdpSatisfiesMfa: editingClient?.tokenExchangeIdpSatisfiesMfa ?? false
      });
    }
  }, [popUp?.clientForm?.isOpen]);

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
    } catch (error) {
      createNotification({
        text:
          (error as Error)?.message ||
          `Failed to ${isEditing ? "update" : "create"} OAuth application`,
        type: "error"
      });
    }
  };

  return (
    <Sheet
      open={popUp?.clientForm?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("clientForm", isOpen);
        if (!isOpen) reset();
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
              <Controller
                control={control}
                name="flow"
                render={({ field: { value, onChange } }) => (
                  <Field>
                    <FieldLabel>Flow</FieldLabel>
                    <Tabs value={value} onValueChange={onChange}>
                      <TabsList variant="filled" className="w-full">
                        <TabsTrigger value={OauthClientFlow.AuthorizationCode}>
                          Authorization code
                        </TabsTrigger>
                        <TabsTrigger value={OauthClientFlow.TokenExchange}>
                          Token exchange
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <FieldDescription>{FLOW_DESCRIPTIONS[value]}</FieldDescription>
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
              {flow === OauthClientFlow.TokenExchange && (
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
              isDisabled={isCreating || isUpdating}
            >
              {isEditing ? "Save Changes" : "Create Application"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
