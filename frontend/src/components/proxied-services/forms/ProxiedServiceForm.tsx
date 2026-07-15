import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { InfoIcon, PlusIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  IconButton,
  Input,
  SheetFooter,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "@app/hooks/api/proxiedServices/enums";
import {
  useCreateProxiedService,
  useUpdateProxiedService
} from "@app/hooks/api/proxiedServices/mutations";
import {
  TDashboardProxiedService,
  TProxiedServiceCredentialInput,
  TProxiedServiceLeaseConfig
} from "@app/hooks/api/proxiedServices/types";

import { CredentialSourceFields, TCredentialSource } from "./CredentialSourceFields";
import { DynamicSecretLeaseSettings } from "./DynamicSecretLeaseSettings";
import {
  HeaderRewritingMode,
  proxiedServiceFormSchema,
  TCredentialSourceForm,
  TLeaseConfig,
  TProxiedServiceForm
} from "./schema";
import { SurfaceSelect } from "./SurfaceSelect";

type Props = {
  projectId: string;
  environment: string;
  secretPath: string;
  proxiedService?: TDashboardProxiedService;
  onComplete: () => void;
  onCancel: () => void;
};

const genPlaceholder = () =>
  `placeholder_${Array.from({ length: 12 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("")}`;

const emptySource = (): TCredentialSourceForm => ({
  secretKey: "",
  dynamicSecretName: "",
  dynamicSecretField: ""
});

const toSource = (c: TDashboardProxiedService["credentials"][number]): TCredentialSourceForm =>
  c.dynamicSecretName
    ? {
        secretKey: "",
        dynamicSecretName: c.dynamicSecretName,
        dynamicSecretField: c.dynamicSecretField ?? ""
      }
    : {
        secretKey: c.secretKey ?? "",
        dynamicSecretName: "",
        dynamicSecretField: ""
      };

const hasSource = (src: TCredentialSourceForm) => Boolean(src.secretKey || src.dynamicSecretName);

const toLeaseConfig = (leaseConfig?: TLeaseConfig): TProxiedServiceLeaseConfig | undefined => {
  if (!leaseConfig) return undefined;
  const cfg: TProxiedServiceLeaseConfig = {};
  if (leaseConfig.namespace) cfg.namespace = leaseConfig.namespace;
  if (leaseConfig.principals?.length) cfg.principals = leaseConfig.principals;
  return Object.keys(cfg).length ? cfg : undefined;
};

const sourceToInput = (
  src: TCredentialSourceForm,
  configs: Record<string, TLeaseConfig>
): Pick<
  TProxiedServiceCredentialInput,
  "secretKey" | "dynamicSecretName" | "dynamicSecretField" | "dynamicSecretConfig"
> =>
  src.dynamicSecretName
    ? {
        dynamicSecretName: src.dynamicSecretName,
        dynamicSecretField: src.dynamicSecretField,
        dynamicSecretConfig: toLeaseConfig(configs[src.dynamicSecretName])
      }
    : { secretKey: src.secretKey };

const toDynamicSecretConfigs = (svc: TDashboardProxiedService): Record<string, TLeaseConfig> => {
  const configs: Record<string, TLeaseConfig> = {};
  svc.credentials.forEach((c) => {
    if (!c.dynamicSecretName || configs[c.dynamicSecretName]) return;
    const cfg = c.dynamicSecretConfig;
    if (cfg?.namespace || cfg?.principals?.length) {
      configs[c.dynamicSecretName] = { namespace: cfg.namespace, principals: cfg.principals };
    }
  });
  return configs;
};

const toDefaultValues = (svc?: TDashboardProxiedService): TProxiedServiceForm => {
  if (!svc) {
    return {
      name: "",
      hostPattern: "",
      isEnabled: true,
      headerMode: HeaderRewritingMode.Headers,
      headers: [{ ...emptySource(), headerName: "Authorization", headerPrefix: "Bearer" }],
      basicAuth: { username: emptySource(), password: emptySource() },
      substitutions: [],
      dynamicSecretConfigs: {}
    };
  }

  const headerCreds = svc.credentials.filter(
    (c) => c.role === ProxiedServiceCredentialRole.HeaderRewrite
  );
  const isBasicAuth = headerCreds.some((c) => c.headerPurpose);
  const username = headerCreds.find(
    (c) => c.headerPurpose === ProxiedServiceHeaderPurpose.Username
  );
  const password = headerCreds.find(
    (c) => c.headerPurpose === ProxiedServiceHeaderPurpose.Password
  );
  const subs = svc.credentials.filter(
    (c) => c.role === ProxiedServiceCredentialRole.CredentialSubstitution
  );

  return {
    name: svc.name,
    hostPattern: svc.hostPattern,
    isEnabled: svc.isEnabled,
    headerMode: isBasicAuth ? HeaderRewritingMode.BasicAuth : HeaderRewritingMode.Headers,
    headers: isBasicAuth
      ? []
      : headerCreds.map((c) => ({
          ...toSource(c),
          headerName: c.headerName ?? "",
          headerPrefix: c.headerPrefix ?? ""
        })),
    basicAuth: {
      username: username ? toSource(username) : emptySource(),
      password: password ? toSource(password) : emptySource()
    },
    substitutions: subs.map((c) => ({
      ...toSource(c),
      placeholderKey: c.placeholderKey ?? "",
      placeholderValue: c.placeholderValue ?? genPlaceholder(),
      surfaces: (c.substitutionSurfaces ?? []) as ProxiedServiceSubstitutionSurface[]
    })),
    dynamicSecretConfigs: toDynamicSecretConfigs(svc)
  };
};

const toCredentials = (form: TProxiedServiceForm): TProxiedServiceCredentialInput[] => {
  const credentials: TProxiedServiceCredentialInput[] = [];
  const configs = form.dynamicSecretConfigs ?? {};

  if (form.headerMode === HeaderRewritingMode.BasicAuth) {
    if (form.basicAuth && hasSource(form.basicAuth.username)) {
      credentials.push({
        ...sourceToInput(form.basicAuth.username, configs),
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerPurpose: ProxiedServiceHeaderPurpose.Username
      });
    }
    if (form.basicAuth && hasSource(form.basicAuth.password)) {
      credentials.push({
        ...sourceToInput(form.basicAuth.password, configs),
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerPurpose: ProxiedServiceHeaderPurpose.Password
      });
    }
  } else {
    form.headers.forEach((h) => {
      credentials.push({
        ...sourceToInput(h, configs),
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerName: h.headerName,
        // omit rather than send null: the API field is optional and rejects null
        headerPrefix: h.headerPrefix || undefined
      });
    });
  }

  form.substitutions.forEach((s) => {
    credentials.push({
      ...sourceToInput(s, configs),
      role: ProxiedServiceCredentialRole.CredentialSubstitution,
      placeholderKey: s.placeholderKey,
      placeholderValue: s.placeholderValue,
      substitutionSurfaces: s.surfaces
    });
  });

  return credentials;
};

export const ProxiedServiceForm = ({
  projectId,
  environment,
  secretPath,
  proxiedService,
  onComplete,
  onCancel
}: Props) => {
  const isEdit = Boolean(proxiedService);
  const createProxiedService = useCreateProxiedService();
  const updateProxiedService = useUpdateProxiedService();

  const {
    control,
    handleSubmit,
    watch,
    register,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<TProxiedServiceForm>({
    resolver: zodResolver(proxiedServiceFormSchema),
    defaultValues: toDefaultValues(proxiedService)
  });

  const headerMode = watch("headerMode");
  const watchedHeaders = watch("headers");
  const watchedBasicAuth = watch("basicAuth");
  const watchedSubstitutions = watch("substitutions");
  const watchedConfigs = watch("dynamicSecretConfigs");

  const headerFields = useFieldArray({ control, name: "headers" });
  const substitutionFields = useFieldArray({ control, name: "substitutions" });

  const setHeaderSource = (i: number, v: TCredentialSource) => {
    setValue(`headers.${i}.secretKey`, v.secretKey ?? "");
    setValue(`headers.${i}.dynamicSecretName`, v.dynamicSecretName ?? "");
    setValue(`headers.${i}.dynamicSecretField`, v.dynamicSecretField ?? "");
  };
  const setSubstitutionSource = (i: number, v: TCredentialSource) => {
    setValue(`substitutions.${i}.secretKey`, v.secretKey ?? "");
    setValue(`substitutions.${i}.dynamicSecretName`, v.dynamicSecretName ?? "");
    setValue(`substitutions.${i}.dynamicSecretField`, v.dynamicSecretField ?? "");
  };
  const setBasicAuthSource = (which: "username" | "password", v: TCredentialSource) => {
    setValue(`basicAuth.${which}.secretKey`, v.secretKey ?? "");
    setValue(`basicAuth.${which}.dynamicSecretName`, v.dynamicSecretName ?? "");
    setValue(`basicAuth.${which}.dynamicSecretField`, v.dynamicSecretField ?? "");
  };

  // computed inline, not memoized: react-hook-form mutates watched objects in place so a useMemo would never recompute
  const referencedDynamicSecretNames = (() => {
    const names = new Set<string>();
    const add = (name?: string) => {
      if (name) names.add(name);
    };
    if (headerMode === HeaderRewritingMode.BasicAuth) {
      add(watchedBasicAuth?.username?.dynamicSecretName);
      add(watchedBasicAuth?.password?.dynamicSecretName);
    } else {
      (watchedHeaders ?? []).forEach((h) => add(h?.dynamicSecretName));
    }
    (watchedSubstitutions ?? []).forEach((s) => add(s?.dynamicSecretName));
    return [...names];
  })();

  const setDynamicSecretConfig = (name: string, config: TLeaseConfig) => {
    setValue("dynamicSecretConfigs", { ...(watchedConfigs ?? {}), [name]: config });
  };

  // The "at least one credential" issue is attached to the headers array node by the schema.
  const headersArrayError = errors.headers as
    | { message?: string; root?: { message?: string } }
    | undefined;
  const headersRootError = headersArrayError?.root?.message ?? headersArrayError?.message;

  const onSubmit = async (form: TProxiedServiceForm) => {
    const credentials = toCredentials(form);
    try {
      if (isEdit && proxiedService) {
        await updateProxiedService.mutateAsync({
          serviceId: proxiedService.id,
          name: form.name,
          hostPattern: form.hostPattern,
          isEnabled: form.isEnabled,
          credentials
        });
      } else {
        await createProxiedService.mutateAsync({
          projectId,
          environment,
          secretPath,
          name: form.name,
          hostPattern: form.hostPattern,
          isEnabled: form.isEnabled,
          credentials
        });
      }
      createNotification({
        text: `Successfully ${isEdit ? "updated" : "created"} proxied service`,
        type: "success"
      });
      onComplete();
    } catch (err) {
      const raw = (err as AxiosError<{ message?: string | { message?: string }[] }>)?.response?.data
        ?.message;
      const detail = Array.isArray(raw)
        ? raw
            .map((issue) => issue?.message)
            .filter(Boolean)
            .join(", ")
        : raw;
      createNotification({
        text: `Failed to ${isEdit ? "update" : "create"} proxied service${detail ? `: ${detail}` : ""}`,
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Field>
          <FieldLabel>Service Name</FieldLabel>
          <FieldContent>
            <Input placeholder="stripe-api" isError={Boolean(errors.name)} {...register("name")} />
            <FieldDescription>Lowercase letters, numbers, and hyphens only.</FieldDescription>
            <FieldError errors={[errors.name]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel>
            Host Pattern
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  The hosts whose traffic this service brokers. Separate multiple with commas, for
                  example:
                </p>
                <p className="mt-1.5 font-mono">
                  api.stripe.com, *.github.com/v1/*, internal.corp.com:8443
                </p>
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <FieldContent>
            <Input
              placeholder="api.stripe.com, *.github.com/v1/*"
              isError={Boolean(errors.hostPattern)}
              {...register("hostPattern")}
            />
            <FieldError errors={[errors.hostPattern]} />
          </FieldContent>
        </Field>

        <Controller
          control={control}
          name="isEnabled"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Enabled</FieldTitle>
                <FieldDescription>
                  When off, the proxy stops brokering this service&apos;s traffic.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="proxied-service-enabled"
                variant="project"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </Field>
          )}
        />

        <div className="flex flex-col gap-3">
          <Tabs
            value={headerMode}
            onValueChange={(value) => setValue("headerMode", value as HeaderRewritingMode)}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Header Rewrites</p>
                <p className="mt-1 text-xs text-muted">Sets these headers on every request.</p>
              </div>
              <TabsList>
                <TabsTrigger value={HeaderRewritingMode.Headers}>Custom Headers</TabsTrigger>
                <TabsTrigger value={HeaderRewritingMode.BasicAuth}>Basic Auth</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value={HeaderRewritingMode.Headers} className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 rounded-md border border-border bg-container/50 p-4">
                {headerFields.fields.length === 0 && (
                  <p className="text-center text-sm text-muted">
                    No headers added. Click below to add.
                  </p>
                )}
                {headerFields.fields.map((row, i) => (
                  <div key={row.id} className="flex items-start gap-3">
                    <Field className="flex-1">
                      {i === 0 && <FieldLabel className="text-xs">Name</FieldLabel>}
                      <FieldContent>
                        <Input
                          placeholder="Authorization"
                          isError={Boolean(errors.headers?.[i]?.headerName)}
                          {...register(`headers.${i}.headerName`)}
                        />
                        <FieldError errors={[errors.headers?.[i]?.headerName]} />
                      </FieldContent>
                    </Field>
                    <Field className="w-28">
                      {i === 0 && <FieldLabel className="text-xs">Prefix</FieldLabel>}
                      <FieldContent>
                        <Input placeholder="Bearer" {...register(`headers.${i}.headerPrefix`)} />
                      </FieldContent>
                    </Field>
                    <Field className="flex-1">
                      {i === 0 && <FieldLabel className="text-xs">Value</FieldLabel>}
                      <FieldContent>
                        <CredentialSourceFields
                          projectId={projectId}
                          environment={environment}
                          secretPath={secretPath}
                          value={{
                            secretKey: watchedHeaders?.[i]?.secretKey,
                            dynamicSecretName: watchedHeaders?.[i]?.dynamicSecretName,
                            dynamicSecretField: watchedHeaders?.[i]?.dynamicSecretField
                          }}
                          onChange={(v) => setHeaderSource(i, v)}
                          isSecretError={Boolean(errors.headers?.[i]?.secretKey)}
                          isFieldError={Boolean(errors.headers?.[i]?.dynamicSecretField)}
                        />
                        <FieldError
                          errors={[
                            errors.headers?.[i]?.secretKey,
                            errors.headers?.[i]?.dynamicSecretField
                          ]}
                        />
                      </FieldContent>
                    </Field>
                    <IconButton
                      variant="ghost"
                      size="xs"
                      type="button"
                      aria-label="Remove header"
                      className={twMerge(
                        i === 0 ? "mt-6.5" : "mt-0.5",
                        "transition-transform hover:text-danger"
                      )}
                      onClick={() => headerFields.remove(i)}
                    >
                      <TrashIcon className="size-4" />
                    </IconButton>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  onClick={() =>
                    headerFields.append({ ...emptySource(), headerName: "", headerPrefix: "" })
                  }
                >
                  <PlusIcon className="mr-1 size-4" />
                  Add Header
                </Button>
              </div>
              {headersRootError && <FieldError>{headersRootError}</FieldError>}
            </TabsContent>

            <TabsContent value={HeaderRewritingMode.BasicAuth}>
              <div className="flex gap-3 rounded-md border border-border bg-container/50 p-4">
                <Field className="flex-1">
                  <FieldLabel>Username</FieldLabel>
                  <FieldContent>
                    <CredentialSourceFields
                      projectId={projectId}
                      environment={environment}
                      secretPath={secretPath}
                      value={{
                        secretKey: watchedBasicAuth?.username?.secretKey,
                        dynamicSecretName: watchedBasicAuth?.username?.dynamicSecretName,
                        dynamicSecretField: watchedBasicAuth?.username?.dynamicSecretField
                      }}
                      onChange={(v) => setBasicAuthSource("username", v)}
                      isSecretError={Boolean(errors.basicAuth?.username?.secretKey)}
                      isFieldError={Boolean(errors.basicAuth?.username?.dynamicSecretField)}
                    />
                    <FieldError
                      errors={[
                        errors.basicAuth?.username?.secretKey,
                        errors.basicAuth?.username?.dynamicSecretField
                      ]}
                    />
                  </FieldContent>
                </Field>
                <Field className="flex-1">
                  <FieldLabel>Password</FieldLabel>
                  <FieldContent>
                    <CredentialSourceFields
                      projectId={projectId}
                      environment={environment}
                      secretPath={secretPath}
                      value={{
                        secretKey: watchedBasicAuth?.password?.secretKey,
                        dynamicSecretName: watchedBasicAuth?.password?.dynamicSecretName,
                        dynamicSecretField: watchedBasicAuth?.password?.dynamicSecretField
                      }}
                      onChange={(v) => setBasicAuthSource("password", v)}
                      isSecretError={Boolean(errors.basicAuth?.password?.secretKey)}
                      isFieldError={Boolean(errors.basicAuth?.password?.dynamicSecretField)}
                    />
                    <FieldError
                      errors={[
                        errors.basicAuth?.password?.secretKey,
                        errors.basicAuth?.password?.dynamicSecretField
                      ]}
                    />
                  </FieldContent>
                </Field>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Secret Substitution</p>
            <p className="mt-1 text-xs text-muted">
              When an agent launches with{" "}
              <span className="font-mono text-foreground">
                infisical secrets agent-proxy connect
              </span>
              , Infisical sets each placeholder below as an environment variable on it. The agent
              sends the placeholder in its requests, and the proxy swaps it for the real secret on
              the wire.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {substitutionFields.fields.length === 0 && (
              <div className="rounded-md border border-border bg-container/50 p-4 text-center text-sm text-muted">
                No substitutions added. Click below to add.
              </div>
            )}
            {substitutionFields.fields.map((row, i) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-md border border-border bg-container/50 p-4 text-sm"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  <span className="shrink-0 text-muted">Set</span>
                  <Input
                    className="w-44 font-mono"
                    placeholder="ENV_VAR_NAME"
                    isError={Boolean(errors.substitutions?.[i]?.placeholderKey)}
                    {...register(`substitutions.${i}.placeholderKey`)}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3.5 shrink-0 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Infisical sets this environment variable on the agent for you, holding the
                      placeholder value.
                    </TooltipContent>
                  </Tooltip>
                  <span className="shrink-0 text-muted">to the placeholder</span>
                  <Input
                    className="min-w-0 flex-1 font-mono"
                    placeholder="placeholder_value"
                    isError={Boolean(errors.substitutions?.[i]?.placeholderValue)}
                    {...register(`substitutions.${i}.placeholderValue`)}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3.5 shrink-0 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      The value the agent sends instead of the real secret; the proxy swaps it on
                      the wire.
                    </TooltipContent>
                  </Tooltip>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    type="button"
                    aria-label="Remove substitution"
                    className="shrink-0 transition-transform hover:text-danger"
                    onClick={() => substitutionFields.remove(i)}
                  >
                    <TrashIcon className="size-4" />
                  </IconButton>
                </div>
                <FieldError
                  errors={[
                    errors.substitutions?.[i]?.placeholderKey,
                    errors.substitutions?.[i]?.placeholderValue
                  ]}
                />

                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-muted">and replace it in</span>
                  <div className="flex-1">
                    <Controller
                      control={control}
                      name={`substitutions.${i}.surfaces`}
                      render={({ field }) => (
                        <SurfaceSelect value={field.value} onChange={field.onChange} />
                      )}
                    />
                    <FieldError errors={[errors.substitutions?.[i]?.surfaces]} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-muted">with value of</span>
                  <div className="flex-1">
                    <CredentialSourceFields
                      projectId={projectId}
                      environment={environment}
                      secretPath={secretPath}
                      value={{
                        secretKey: watchedSubstitutions?.[i]?.secretKey,
                        dynamicSecretName: watchedSubstitutions?.[i]?.dynamicSecretName,
                        dynamicSecretField: watchedSubstitutions?.[i]?.dynamicSecretField
                      }}
                      onChange={(v) => setSubstitutionSource(i, v)}
                      isSecretError={Boolean(errors.substitutions?.[i]?.secretKey)}
                      isFieldError={Boolean(errors.substitutions?.[i]?.dynamicSecretField)}
                    />
                    <FieldError
                      errors={[
                        errors.substitutions?.[i]?.secretKey,
                        errors.substitutions?.[i]?.dynamicSecretField
                      ]}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div>
            <Button
              variant="ghost"
              size="xs"
              type="button"
              onClick={() =>
                substitutionFields.append({
                  ...emptySource(),
                  placeholderKey: "",
                  placeholderValue: genPlaceholder(),
                  surfaces: []
                })
              }
            >
              <PlusIcon className="mr-1 size-4" />
              Add Substitution
            </Button>
          </div>
        </div>

        <DynamicSecretLeaseSettings
          environment={environment}
          secretPath={secretPath}
          referencedNames={referencedDynamicSecretNames}
          configs={watchedConfigs ?? {}}
          onChange={setDynamicSecretConfig}
        />
      </div>

      <SheetFooter className="border-t">
        <Button isPending={isSubmitting} isDisabled={isSubmitting} variant="project" type="submit">
          {isEdit ? "Update Proxied Service" : "Create Proxied Service"}
        </Button>
        <Button onClick={onCancel} variant="outline" type="button">
          Cancel
        </Button>
      </SheetFooter>
    </form>
  );
};
