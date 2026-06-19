import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { apiRequest } from "@app/config/request";
import { useOrganization, useOrgPermission, useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  APP_CONNECTION_MAP,
  buildGitHubAppInstallUrl,
  buildGitHubHostUrl,
  CSRF_TOKEN_STORAGE_KEY,
  generateCsrfToken,
  getAppConnectionMethodDetails,
  GITHUB_CONNECTION_FORM_STORAGE_KEY,
  useGetAppConnectionOauthReturnUrl
} from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useScopeVariant } from "@app/hooks";
import {
  GitHubConnectionMethod,
  TGitHubConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { gatewayPoolsQueryKeys } from "@app/hooks/api/gateway-pools/queries";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { TGitHubApp, useListGitHubApps } from "@app/hooks/api/gitHubApps";

import { GitHubFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
import { useAppConnectionForm } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";
import { GitHubAppSelector } from "./GitHubAppSelector";

type Props = {
  appConnection?: TGitHubConnection;
  projectId: string | undefined | null;
  onSubmit: (formData: PatSchemaForm) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GitHub),
  method: z.nativeEnum(GitHubConnectionMethod)
});

const baseCredentialsSchema = z.union([
  z.object({
    instanceType: z.literal("server"),
    host: z.string().min(1, "Host is required for server instance type")
  }),
  z.object({
    instanceType: z.literal("cloud").optional(),
    host: z.string().optional()
  })
]);

const appSchema = rootSchema.extend({
  method: z.literal(GitHubConnectionMethod.App),
  credentials: baseCredentialsSchema
});

const oauthSchema = rootSchema.extend({
  method: z.literal(GitHubConnectionMethod.OAuth),
  credentials: baseCredentialsSchema
});

const patSchema = rootSchema.extend({
  method: z.literal(GitHubConnectionMethod.Pat),
  credentials: z.union([
    z.object({
      instanceType: z.literal("server"),
      host: z.string().min(1, "Host is required for server instance type"),
      personalAccessToken: z.string().min(1, "Personal Access Token is required")
    }),
    z.object({
      instanceType: z.literal("cloud").optional(),
      host: z.string().optional(),
      personalAccessToken: z.string().min(1, "Personal Access Token is required")
    })
  ])
});

type PatSchemaForm = z.infer<typeof patSchema>;

const formSchema = z.discriminatedUnion("method", [appSchema, oauthSchema, patSchema]);

type FormData = z.infer<typeof formSchema>;

export const GitHubConnectionForm = ({ appConnection, projectId, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const scopeVariant = useScopeVariant();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isEnterpriseEnabled, setIsEnterpriseEnabled] = useState(() =>
    Boolean(
      appConnection?.credentials &&
        "host" in appConnection.credentials &&
        appConnection.credentials.host
    )
  );

  const { currentOrg } = useOrganization();
  const { permission: orgPermission } = useOrgPermission();
  // In project scope, org apps are only listed when the user can read org-level app connections
  // (mirrors the backend filtering on the list endpoint); using one additionally requires the
  // org-level connect action, enforced server-side.
  const canSeeOrgApps = orgPermission.can(
    OrgPermissionAppConnectionActions.Read,
    OrgPermissionSubjects.AppConnections
  );

  const {
    option: { oauthClientId, appClientSlug },
    isLoading
  } = useGetAppConnectionOption(AppConnection.GitHub);

  const { data: gitHubApps = [], isPending: isGitHubAppsLoading } = useListGitHubApps(
    currentOrg?.id,
    projectId
  );

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.GitHub,
      method: GitHubConnectionMethod.App,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        instanceType: "cloud"
      }
    }
  });

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isSubmitting, isDirty }
  } = form;

  const { subscription } = useSubscription();

  const selectedMethod = watch("method");
  const instanceType = watch("credentials.instanceType");
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  // Resolve the selected gateway/pool name so the create-app modal can tell the user how Infisical
  // will reach GitHub. Both lists are already cached by the gateway picker above.
  const { data: gateways } = useQuery({
    ...gatewaysQueryKeys.list(),
    enabled: Boolean(gatewayId)
  });
  const { data: gatewayPools } = useQuery({
    ...gatewayPoolsQueryKeys.list(),
    enabled: Boolean(gatewayPoolId)
  });

  const getGatewayLabel = () => {
    if (gatewayPoolId) return gatewayPools?.find((pool) => pool.id === gatewayPoolId)?.name ?? null;
    if (gatewayId) return gateways?.find((gateway) => gateway.id === gatewayId)?.name ?? null;
    return null;
  };
  const gatewayLabel = getGatewayLabel();

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const sharedApp = gitHubApps.find((app) => app.id === null) ?? null;

  // For new App-method connections the user picks which GitHub App to install. Default to the
  // instance-default (shared) app when one is configured.
  const [selectedGitHubApp, setSelectedGitHubApp] = useState<TGitHubApp | null>(null);
  // After returning from the "Create new GitHub App" flow, the app to auto-select once it loads.
  const [pendingGitHubAppId, setPendingGitHubAppId] = useState<string | null>(null);
  // The form is restored (not edited) after resuming, so `isDirty` stays false — track this to keep
  // the Connect button enabled.
  const [isResumed, setIsResumed] = useState(false);

  // When we come back from creating a new GitHub App, restore the in-progress form and remember the
  // new app so we can select it. The connection itself is created later when the user hits Connect.
  useEffect(() => {
    if (isUpdate) return;
    try {
      const raw = localStorage.getItem(GITHUB_CONNECTION_FORM_STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as {
        method?: GitHubConnectionMethod;
        name?: string;
        description?: string | null;
        gatewayId?: string | null;
        gatewayPoolId?: string | null;
        credentials?: { instanceType?: "cloud" | "server"; host?: string };
        resumeWithGitHubAppId?: string;
      };
      if (!stored.resumeWithGitHubAppId) return;

      form.reset({
        app: AppConnection.GitHub,
        method: stored.method ?? GitHubConnectionMethod.App,
        gatewayId: stored.gatewayId ?? null,
        gatewayPoolId: stored.gatewayPoolId ?? null,
        name: stored.name ?? "",
        description: stored.description ?? null,
        credentials: {
          instanceType: stored.credentials?.instanceType ?? "cloud",
          ...(stored.credentials?.host ? { host: stored.credentials.host } : {})
        }
      } as FormData);
      if (stored.credentials?.host) setIsEnterpriseEnabled(true);
      setPendingGitHubAppId(stored.resumeWithGitHubAppId);
      setIsResumed(true);
    } catch {
      // ignore malformed state
    } finally {
      localStorage.removeItem(GITHUB_CONNECTION_FORM_STORAGE_KEY);
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve the pending (newly created) app to the loaded list, then select it.
  useEffect(() => {
    if (!pendingGitHubAppId) return;
    const match = gitHubApps.find((app) => app.id === pendingGitHubAppId);
    if (match) {
      setSelectedGitHubApp(match);
      setPendingGitHubAppId(null);
    }
  }, [pendingGitHubAppId, gitHubApps]);

  useEffect(() => {
    if (isUpdate || selectedGitHubApp || pendingGitHubAppId || !sharedApp) return;
    setSelectedGitHubApp(sharedApp);
  }, [isUpdate, selectedGitHubApp, pendingGitHubAppId, sharedApp]);

  // On reconnect, reuse the GitHub App the connection was originally created with.
  const existingGitHubAppId =
    (appConnection?.credentials as { gitHubAppId?: string | null } | undefined)?.gitHubAppId ??
    null;
  const reconnectApp = isUpdate
    ? (gitHubApps.find((app) => (app.id ?? null) === existingGitHubAppId) ?? null)
    : null;

  const storeConnectionFormData = (
    formData: FormData,
    installState: string,
    gitHubAppId?: string | null,
    appSlug?: string
  ) => {
    localStorage.setItem(CSRF_TOKEN_STORAGE_KEY, installState);
    localStorage.setItem(
      GITHUB_CONNECTION_FORM_STORAGE_KEY,
      JSON.stringify({
        ...formData,
        credentials: {
          ...(formData.credentials as TGitHubConnection["credentials"]),
          ...(gitHubAppId ? { gitHubAppId } : {})
        },
        ...(appSlug ? { appSlug } : {}),
        connectionId: appConnection?.id,
        projectId,
        returnUrl
      } as GitHubFormData)
    );
  };

  const handleCreateApp = async ({ name, githubOrg }: { name: string; githubOrg: string }) => {
    const formData = form.getValues();
    setIsRedirecting(true);
    const installState = generateCsrfToken();
    storeConnectionFormData(formData, installState);

    try {
      const { data } = await apiRequest.post<{
        state: string;
        manifest: Record<string, unknown>;
        githubActionUrl: string;
      }>("/api/v1/github-apps/manifest/initiate", {
        name,
        instanceType: formData.credentials?.instanceType ?? "cloud",
        githubOrg: githubOrg || undefined,
        githubHost: formData.credentials?.host || undefined,
        installState,
        projectId: projectId || undefined,
        gatewayId: formData.gatewayId || undefined,
        gatewayPoolId: formData.gatewayPoolId || undefined
      });

      const formEl = document.createElement("form");
      formEl.method = "post";
      formEl.action = `${data.githubActionUrl}?state=${encodeURIComponent(data.state)}`;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "manifest";
      input.value = JSON.stringify(data.manifest);
      formEl.appendChild(input);
      document.body.appendChild(formEl);
      formEl.submit();
      return true;
    } catch (err) {
      setIsRedirecting(false);
      createNotification({
        type: "error",
        text:
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (err instanceof Error ? err.message : "Failed to start GitHub App creation.")
      });
      return false;
    }
  };

  const submitHandler = async (formData: FormData) => {
    if (formData.method === GitHubConnectionMethod.Pat) {
      await onSubmit(formData);
      return;
    }

    setIsRedirecting(true);

    // generate install state here so the OAuth callback can validate it
    const installState = generateCsrfToken();
    const githubHost = buildGitHubHostUrl(formData.credentials?.host);

    switch (formData.method) {
      case GitHubConnectionMethod.App: {
        const targetApp = isUpdate ? reconnectApp : selectedGitHubApp;
        const slug = targetApp?.slug ?? appClientSlug;

        storeConnectionFormData(formData, installState, targetApp?.id ?? undefined, slug);

        // Always use GitHub's install flow: the user selects the account + repos on GitHub's own UI,
        window.location.assign(
          buildGitHubAppInstallUrl(
            slug ?? "",
            installState,
            formData.credentials?.host,
            formData.credentials?.instanceType
          )
        );
        break;
      }
      case GitHubConnectionMethod.OAuth:
        storeConnectionFormData(formData, installState);
        window.location.assign(
          `${githubHost}/login/oauth/authorize?client_id=${oauthClientId}&response_type=code&scope=repo,admin:org&redirect_uri=${window.location.origin}/organization/app-connections/github/oauth/callback&state=${installState}`
        );
        break;
      default:
        throw new Error(`Unhandled GitHub Connection method: ${(formData as FormData).method}`);
    }
  };

  let isMissingConfig: boolean;

  switch (selectedMethod) {
    case GitHubConnectionMethod.OAuth:
      isMissingConfig = !oauthClientId;
      break;
    case GitHubConnectionMethod.App:
      // On reconnect we need the original app to still resolve. For new connections the selector
      // always lets the user pick or create an app, so there's no missing-config state.
      isMissingConfig = isUpdate && !reconnectApp && !appClientSlug;
      break;
    case GitHubConnectionMethod.Pat:
      isMissingConfig = false;
      break;
    default:
      throw new Error(`Unhandled GitHub Connection method: ${selectedMethod}`);
  }

  const customHost = watch("credentials.host")?.trim().toLowerCase();
  const isCloudCustomHostUnsupported =
    isInfisicalCloud() &&
    selectedMethod !== GitHubConnectionMethod.Pat &&
    !!customHost &&
    customHost !== "github.com";

  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  const getMethodErrorText = (fieldError?: { message?: string }) => {
    if (!isLoading && isMissingConfig) {
      const configHint = isInfisicalCloud()
        ? "Please contact Infisical."
        : `See Docs to configure ${methodDetails.name.startsWith("GitHub") ? methodDetails.name : `GitHub ${methodDetails.name}`} Connections.`;
      return `Credentials have not been configured. ${configHint}`;
    }
    if (isCloudCustomHostUnsupported) {
      return "GitHub App/OAuth with a custom host is only supported on self-hosted Infisical.";
    }
    return fieldError?.message;
  };

  const isAppMethodMissingSelection =
    selectedMethod === GitHubConnectionMethod.App && !isUpdate && !selectedGitHubApp;

  const getButtonText = () => {
    if (selectedMethod === GitHubConnectionMethod.Pat) {
      return isUpdate ? "Update Connection" : "Create Connection";
    }

    return isUpdate ? "Reconnect to GitHub" : "Connect to GitHub";
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(submitHandler)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <Accordion
          type="single"
          collapsible
          variant="ghost"
          className="mb-4 w-full"
          value={isEnterpriseEnabled ? "enterprise-options" : ""}
          onValueChange={(value) => setIsEnterpriseEnabled(value === "enterprise-options")}
        >
          <AccordionItem value="enterprise-options">
            <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
              GitHub Enterprise Options
            </AccordionTrigger>
            <AccordionContent className="px-0">
              <Controller
                name="credentials.instanceType"
                control={control}
                render={({ field }) => (
                  <Field className="mb-4">
                    <FieldLabel>Instance Type</FieldLabel>
                    <Select
                      value={field.value}
                      onValueChange={(e) => {
                        field.onChange(e);
                        if (e === "cloud") {
                          setValue("gatewayId", null);
                          setValue("gatewayPoolId", null);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Enterprise Cloud" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value="cloud">Enterprise Cloud</SelectItem>
                        <SelectItem value="server">Enterprise Server</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
              <Controller
                name="credentials.host"
                control={control}
                shouldUnregister
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="github-host">
                      Instance Hostname
                      {instanceType === "cloud" && <span className="text-muted"> (optional)</span>}
                    </FieldLabel>
                    <Input
                      id="github-host"
                      {...field}
                      placeholder="github.mycompany.com"
                      isError={Boolean(error?.message)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              {subscription.gateway && instanceType === "server" && (
                <OrgPermissionCan
                  I={OrgGatewayPermissionActions.AttachGateways}
                  a={OrgPermissionSubjects.Gateway}
                >
                  {(isAllowed) => (
                    <Field className="mb-4">
                      <FieldLabel>Gateway</FieldLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div>
                            <GatewayPicker
                              isDisabled={!isAllowed}
                              value={{
                                gatewayId: gatewayId ?? null,
                                gatewayPoolId: gatewayPoolId ?? null
                              }}
                              onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                                setValue("gatewayId", newGwId, { shouldDirty: true });
                                setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                              }}
                            />
                          </div>
                        </TooltipTrigger>
                        {!isAllowed && (
                          <TooltipContent>
                            Restricted access. You don&apos;t have permission to attach gateways to
                            resources.
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </Field>
                  )}
                </OrgPermissionCan>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The method you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.GitHub].name}. This field cannot be changed
                    after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger
                  className="w-full"
                  isError={
                    Boolean(error?.message) || isMissingConfig || isCloudCustomHostUnsupported
                  }
                >
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(GitHubConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                      {method === GitHubConnectionMethod.App ? " (Recommended)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{getMethodErrorText(error)}</FieldError>
            </Field>
          )}
        />
        {selectedMethod === GitHubConnectionMethod.App && !isUpdate && (
          <Field className="mb-4">
            <FieldLabel>
              GitHub App
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  Reuse an existing GitHub App from{" "}
                  {/* eslint-disable-next-line no-nested-ternary */}
                  {projectId
                    ? canSeeOrgApps
                      ? "this project or your organization"
                      : "this project"
                    : "your organization"}
                  , or create a new one. Apps can be shared across multiple connections.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <GitHubAppSelector
              apps={gitHubApps}
              isLoading={isGitHubAppsLoading}
              value={selectedGitHubApp}
              onChange={setSelectedGitHubApp}
              host={watch("credentials.host")}
              instanceType={instanceType}
              gatewayLabel={gatewayLabel}
              onCreateApp={handleCreateApp}
              isCreating={isRedirecting}
              projectId={projectId}
            />
          </Field>
        )}
        {selectedMethod === GitHubConnectionMethod.Pat && (
          <Controller
            name="credentials.personalAccessToken"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel>Personal Access Token</FieldLabel>
                <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        )}
        <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
          <Button
            type="submit"
            variant={scopeVariant}
            isPending={isSubmitting || isRedirecting}
            isDisabled={
              (!isUpdate && !isDirty && !isResumed) ||
              isSubmitting ||
              isMissingConfig ||
              isRedirecting ||
              isCloudCustomHostUnsupported ||
              isAppMethodMissingSelection
            }
          >
            {getButtonText()}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            isDisabled={isSubmitting || isRedirecting}
          >
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
