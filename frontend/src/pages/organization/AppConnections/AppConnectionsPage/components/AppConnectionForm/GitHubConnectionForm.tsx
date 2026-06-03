import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  FormControl,
  Input,
  ModalClose,
  SecretInput,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { apiRequest } from "@app/config/request";
import { useOrganization, useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  APP_CONNECTION_MAP,
  getAppConnectionMethodDetails,
  useGetAppConnectionOauthReturnUrl
} from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import {
  GitHubConnectionMethod,
  TGitHubConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  fetchGitHubAppInstallationStatus,
  TGitHubApp,
  useListGitHubApps
} from "@app/hooks/api/gitHubApps";

import { GitHubFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
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

const GITHUB_CONNECTION_FORM_KEY = "githubConnectionFormData";

type PatSchemaForm = z.infer<typeof patSchema>;

const formSchema = z.discriminatedUnion("method", [appSchema, oauthSchema, patSchema]);

type FormData = z.infer<typeof formSchema>;

export const GitHubConnectionForm = ({ appConnection, projectId, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { currentOrg } = useOrganization();

  const {
    option: { oauthClientId, appClientSlug },
    isLoading
  } = useGetAppConnectionOption(AppConnection.GitHub);

  const { data: gitHubApps = [], isPending: isGitHubAppsLoading } = useListGitHubApps(
    currentOrg?.id
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
      const raw = localStorage.getItem(GITHUB_CONNECTION_FORM_KEY);
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
      setPendingGitHubAppId(stored.resumeWithGitHubAppId);
      setIsResumed(true);
    } catch {
      // ignore malformed state
    } finally {
      localStorage.removeItem(GITHUB_CONNECTION_FORM_KEY);
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

  const buildGithubHost = (host?: string) =>
    host && host.length > 0 ? `https://${host}` : "https://github.com";

  const generateInstallState = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const storeConnectionFormData = (
    formData: FormData,
    installState: string,
    gitHubAppId?: string | null
  ) => {
    localStorage.setItem("latestCSRFToken", installState);
    localStorage.setItem(
      GITHUB_CONNECTION_FORM_KEY,
      JSON.stringify({
        ...formData,
        credentials: {
          ...(formData.credentials as TGitHubConnection["credentials"]),
          ...(gitHubAppId ? { gitHubAppId } : {})
        },
        connectionId: appConnection?.id,
        projectId,
        returnUrl
      } as GitHubFormData)
    );
  };

  // Kicks off GitHub App manifest creation, then redirects to GitHub to create + install the app.
  // This only creates the GitHub App — when the user returns they land back on this form with the
  // new app selected and complete the connection separately, so the connection fields aren't
  // required here (only the GitHub App name, which the selector validates).
  const handleCreateApp = async ({ name, githubOrg }: { name: string; githubOrg: string }) => {
    const formData = form.getValues();
    setIsRedirecting(true);
    const installState = generateInstallState();
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
        installState
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
        text: err instanceof Error ? err.message : "Failed to start GitHub App creation."
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
    const installState = generateInstallState();
    const githubHost = buildGithubHost(formData.credentials?.host);

    switch (formData.method) {
      case GitHubConnectionMethod.App: {
        const targetApp = isUpdate ? reconnectApp : selectedGitHubApp;
        const slug = targetApp?.slug ?? appClientSlug;
        // Custom apps carry an id we persist into credentials; the shared app (id null) resolves
        // to the instance-default app on the backend.
        storeConnectionFormData(formData, installState, targetApp?.id ?? undefined);

        // GitHub never redirects back from the install page when the app is already installed, so
        // installed apps go through the OAuth authorize flow instead — the user re-authorizes
        // (auto-approved if previously authorized) and the backend resolves the installation.
        // Skipped for the shared app on Infisical Cloud, where installations from unrelated orgs
        // make the check meaningless.
        if (targetApp?.id || !isInfisicalCloud()) {
          try {
            const { installed, clientId } = await fetchGitHubAppInstallationStatus({
              gitHubAppId: targetApp?.id ?? undefined
            });

            if (installed) {
              window.location.assign(
                `${githubHost}/login/oauth/authorize?client_id=${clientId}&state=${installState}&redirect_uri=${window.location.origin}/organization/app-connections/github/oauth/callback`
              );
              break;
            }
          } catch {
            // fall through to the install flow — first-time installs must keep working even if
            // the status check is unavailable
          }
        }

        window.location.assign(
          `${githubHost}/${formData.credentials?.instanceType === "server" ? "github-apps" : "apps"}/${slug}/installations/new?state=${installState}`
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
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.GitHub].name
              }. This field cannot be changed after creation.`}
              errorText={getMethodErrorText(error)}
              isError={Boolean(error?.message) || isMissingConfig || isCloudCustomHostUnsupported}
              label="Method"
            >
              <Select
                isDisabled={isUpdate}
                value={value}
                onValueChange={(val) => onChange(val)}
                containerClassName="w-full"
                className="w-full border border-mineshaft-500"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.values(GitHubConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                      {method === GitHubConnectionMethod.App ? " (Recommended)" : ""}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />
        {selectedMethod === GitHubConnectionMethod.App && !isUpdate && (
          <FormControl
            label="GitHub App"
            tooltipText="Reuse an existing GitHub App in your organization or create a new one. Apps can be shared across multiple connections."
          >
            <GitHubAppSelector
              apps={gitHubApps}
              isLoading={isGitHubAppsLoading}
              value={selectedGitHubApp}
              onChange={setSelectedGitHubApp}
              host={instanceType === "server" ? watch("credentials.host") : undefined}
              instanceType={instanceType}
              onCreateApp={handleCreateApp}
              isCreating={isRedirecting}
            />
          </FormControl>
        )}
        {selectedMethod === GitHubConnectionMethod.Pat && (
          <Controller
            name="credentials.personalAccessToken"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Personal Access Token"
              >
                <SecretInput
                  containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
              </FormControl>
            )}
          />
        )}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="enterprise-options" className="data-[state=open]:border-none">
            <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
              <div className="order-1 ml-3">GitHub Enterprise Options</div>
            </AccordionTrigger>
            <AccordionContent childrenClassName="px-0">
              <Controller
                name="credentials.instanceType"
                control={control}
                render={({ field }) => (
                  <FormControl label="Instance Type">
                    <Select
                      value={field.value}
                      onValueChange={(e) => {
                        field.onChange(e);
                        if (e === "cloud") {
                          setValue("gatewayId", null);
                          setValue("gatewayPoolId", null);
                        }
                      }}
                      containerClassName="w-full"
                      className="w-full border border-mineshaft-500"
                      dropdownContainerClassName="max-w-none"
                      placeholder="Enterprise Cloud"
                      position="popper"
                    >
                      <SelectItem value="cloud">Enterprise Cloud</SelectItem>
                      <SelectItem value="server">Enterprise Server</SelectItem>
                    </Select>
                  </FormControl>
                )}
              />

              <Controller
                name="credentials.host"
                control={control}
                shouldUnregister
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="Instance Hostname"
                    isOptional={instanceType === "cloud"}
                    isRequired={instanceType === "server"}
                  >
                    <Input {...field} placeholder="github.com" />
                  </FormControl>
                )}
              />
              {subscription.gateway && instanceType === "server" && (
                <OrgPermissionCan
                  I={OrgGatewayPermissionActions.AttachGateways}
                  a={OrgPermissionSubjects.Gateway}
                >
                  {(isAllowed) => (
                    <FormControl label="Gateway">
                      <Tooltip
                        isDisabled={isAllowed}
                        content="Restricted access. You don't have permission to attach gateways to resources."
                      >
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
                      </Tooltip>
                    </FormControl>
                  )}
                </OrgPermissionCan>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting || isRedirecting}
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
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};
