import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { faCheck, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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
import { Badge } from "@app/components/v3/generic/Badge";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { apiRequest } from "@app/config/request";
import { useSubscription } from "@app/context";
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

import { GitHubFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TGitHubConnection;
  projectId: string | undefined | null;
  onSubmit: (formData: PatSchemaForm) => Promise<void>;
};

type GitHubAppSource = "shared" | "dedicated";

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

const slugifyConnectionName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const buildDedicatedAppSlug = (connectionName: string) => {
  const slug = slugifyConnectionName(connectionName || "");
  return `infisical-${slug}`;
};

type AppSourceCardProps = {
  title: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
};

const AppSourceCard = ({ title, description, icon, selected, onClick }: AppSourceCardProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative flex h-full flex-col items-start gap-2 rounded-md border p-3 text-left transition-all ${
      selected
        ? "border-primary/60 bg-primary/10"
        : "border-mineshaft-500 bg-mineshaft-700/30 hover:border-mineshaft-400 hover:bg-mineshaft-700/60"
    }`}
  >
    {selected && (
      <div className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-mineshaft-900">
        <FontAwesomeIcon icon={faCheck} className="text-[8px]" />
      </div>
    )}
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-mineshaft-600 text-mineshaft-100">
        {icon}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-mineshaft-100">{title}</span>
      </div>
    </div>
    <p className="text-xs leading-relaxed text-mineshaft-300">{description}</p>
  </button>
);

export const GitHubConnectionForm = ({ appConnection, projectId, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId, appClientSlug },
    isLoading
  } = useGetAppConnectionOption(AppConnection.GitHub);

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
  const connectionName = watch("name") ?? "";

  // Dedicated is the recommended default for new connections; update flow is reconnect-only
  // and uses the instance-default app since the dedicated app slug lives in the DB.
  const [appSource, setAppSource] = useState<GitHubAppSource>(isUpdate ? "shared" : "dedicated");
  const [dedicatedAppOrg, setDedicatedAppOrg] = useState("");

  useEffect(() => {
    if (isUpdate) setAppSource("shared");
  }, [isUpdate]);

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const dedicatedAppSlug = buildDedicatedAppSlug(connectionName);

  const submitHandler = async (formData: FormData) => {
    if (formData.method === GitHubConnectionMethod.Pat) {
      await onSubmit(formData);
      return;
    }

    setIsRedirecting(true);

    // generate install state here so the OAuth callback can validate it
    const installState = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    localStorage.setItem("latestCSRFToken", installState);
    localStorage.setItem(
      "githubConnectionFormData",
      JSON.stringify({
        ...formData,
        credentials: formData.credentials as TGitHubConnection["credentials"],
        connectionId: appConnection?.id,
        projectId,
        returnUrl
      } as GitHubFormData)
    );

    const githubHost =
      formData.credentials?.host && formData.credentials.host.length > 0
        ? `https://${formData.credentials.host}`
        : "https://github.com";

    switch (formData.method) {
      case GitHubConnectionMethod.App: {
        if (appSource === "dedicated") {
          const { data } = await apiRequest.post<{
            state: string;
            manifest: Record<string, unknown>;
            githubActionUrl: string;
          }>("/api/v1/github-apps/manifest/initiate", {
            name: dedicatedAppSlug,
            instanceType: formData.credentials?.instanceType ?? "cloud",
            githubOrg: dedicatedAppOrg.trim() || undefined,
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
          return;
        }

        window.location.assign(
          `${githubHost}/${formData.credentials?.instanceType === "server" ? "github-apps" : "apps"}/${appClientSlug}/installations/new?state=${installState}`
        );
        break;
      }
      case GitHubConnectionMethod.OAuth:
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
      isMissingConfig = (isUpdate || appSource === "shared") && !appClientSlug;
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

  const getButtonText = () => {
    if (selectedMethod === GitHubConnectionMethod.Pat) {
      return isUpdate ? "Update Connection" : "Create Connection";
    }

    if (selectedMethod === GitHubConnectionMethod.App && appSource === "dedicated" && !isUpdate) {
      return "Create app & connect";
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
            label="GitHub App setup"
            tooltipText="Reuse the shared instance-default GitHub App or create a new private app dedicated to this connection."
          >
            <div className="flex flex-col gap-3">
              {appClientSlug && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <AppSourceCard
                    title="Use shared app"
                    description="Reuse the instance-default GitHub App. Best for teams managing many connections."
                    icon={<FontAwesomeIcon icon={faGithub} className="text-base" />}
                    selected={appSource === "shared"}
                    onClick={() => setAppSource("shared")}
                  />
                  <AppSourceCard
                    title="Create dedicated app"
                    description="One app per connection. Maximum isolation, no admin handoff."
                    icon={<FontAwesomeIcon icon={faPlus} className="text-base" />}
                    selected={appSource === "dedicated"}
                    onClick={() => setAppSource("dedicated")}
                  />
                </div>
              )}
              {appSource === "dedicated" && (
                <>
                  <div className="flex items-start gap-3 rounded-md border border-mineshaft-500 bg-mineshaft-700/40 px-3 py-2.5">
                    <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm bg-primary/15 text-primary">
                      <FontAwesomeIcon icon={faPlus} className="text-xs" />
                    </div>
                    <div className="text-xs leading-relaxed text-mineshaft-300">
                      Will create and install{" "}
                      <span className="font-mono text-mineshaft-100">{dedicatedAppSlug}</span>{" "}
                      <Badge variant="info" className="ml-1">
                        New
                      </Badge>
                      <div className="mt-0.5 text-mineshaft-400">
                        Private · scoped to this connection
                      </div>
                    </div>
                  </div>
                  <FormControl
                    label="GitHub Organization"
                    isOptional
                    helperText="Leave blank to register under your personal account."
                    className="mb-0"
                  >
                    <Input
                      value={dedicatedAppOrg}
                      onChange={(e) => setDedicatedAppOrg(e.target.value)}
                      placeholder="my-github-org"
                    />
                  </FormControl>
                </>
              )}
              {appSource === "shared" && appClientSlug && (
                <div className="flex items-start gap-3 rounded-md border border-mineshaft-500 bg-mineshaft-700/40 px-3 py-2.5">
                  <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-sm bg-mineshaft-600 text-mineshaft-200">
                    <FontAwesomeIcon icon={faGithub} className="text-xs" />
                  </div>
                  <div className="text-xs leading-relaxed text-mineshaft-300">
                    Will install{" "}
                    <span className="font-mono text-mineshaft-100">{appClientSlug}</span>
                    <div className="mt-0.5 text-mineshaft-400">
                      Public · shared across all connections
                    </div>
                  </div>
                </div>
              )}
            </div>
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
              isSubmitting ||
              (!isUpdate && !isDirty) ||
              isMissingConfig ||
              isRedirecting ||
              isCloudCustomHostUnsupported
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
