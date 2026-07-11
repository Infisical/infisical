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
  IconButton,
  Input,
  SheetFooter,
  Switch,
  Tabs,
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
  TProxiedServiceCredentialInput
} from "@app/hooks/api/proxiedServices/types";

import { HeaderRewritingMode, proxiedServiceFormSchema, TProxiedServiceForm } from "./schema";
import { SecretSelect } from "./SecretSelect";
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

const toDefaultValues = (svc?: TDashboardProxiedService): TProxiedServiceForm => {
  if (!svc) {
    return {
      name: "",
      hostPattern: "",
      isEnabled: true,
      headerMode: HeaderRewritingMode.Headers,
      headers: [{ secretKey: "", headerName: "Authorization", headerPrefix: "Bearer" }],
      substitutions: []
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
          secretKey: c.secretKey,
          headerName: c.headerName ?? "",
          headerPrefix: c.headerPrefix ?? ""
        })),
    basicAuth: isBasicAuth
      ? {
          usernameSecretKey: username?.secretKey ?? "",
          passwordSecretKey: password?.secretKey ?? ""
        }
      : undefined,
    substitutions: subs.map((c) => ({
      placeholderKey: c.placeholderKey ?? "",
      placeholderValue: c.placeholderValue ?? genPlaceholder(),
      secretKey: c.secretKey,
      surfaces: (c.substitutionSurfaces ?? []) as ProxiedServiceSubstitutionSurface[]
    }))
  };
};

const toCredentials = (form: TProxiedServiceForm): TProxiedServiceCredentialInput[] => {
  const credentials: TProxiedServiceCredentialInput[] = [];

  if (form.headerMode === HeaderRewritingMode.BasicAuth) {
    if (form.basicAuth?.usernameSecretKey) {
      credentials.push({
        secretKey: form.basicAuth.usernameSecretKey,
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerPurpose: ProxiedServiceHeaderPurpose.Username
      });
    }
    if (form.basicAuth?.passwordSecretKey) {
      credentials.push({
        secretKey: form.basicAuth.passwordSecretKey,
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerPurpose: ProxiedServiceHeaderPurpose.Password
      });
    }
  } else {
    form.headers.forEach((h) => {
      credentials.push({
        secretKey: h.secretKey,
        role: ProxiedServiceCredentialRole.HeaderRewrite,
        headerName: h.headerName,
        // omit rather than send null: the API field is optional and rejects null
        headerPrefix: h.headerPrefix || undefined
      });
    });
  }

  form.substitutions.forEach((s) => {
    credentials.push({
      secretKey: s.secretKey,
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
    formState: { errors, isSubmitting }
  } = useForm<TProxiedServiceForm>({
    resolver: zodResolver(proxiedServiceFormSchema),
    defaultValues: toDefaultValues(proxiedService)
  });

  const headerMode = watch("headerMode");

  const headerFields = useFieldArray({ control, name: "headers" });
  const substitutionFields = useFieldArray({ control, name: "substitutions" });

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
        <Controller
          control={control}
          name="isEnabled"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldLabel htmlFor="proxied-service-enabled" className="cursor-pointer">
                Enabled
              </FieldLabel>
              <Switch
                id="proxied-service-enabled"
                variant="project"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </Field>
          )}
        />

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
                The hosts this service applies to. Match an exact host, a wildcard (*.stripe.com),
                or a port/path (api.stripe.com:443/v1/*). Comma-separate multiple patterns.
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <FieldContent>
            <Input
              placeholder="api.stripe.com"
              isError={Boolean(errors.hostPattern)}
              {...register("hostPattern")}
            />
            <FieldError errors={[errors.hostPattern]} />
          </FieldContent>
        </Field>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Header Rewriting</p>
              <p className="mt-1 text-xs text-muted">Sets these headers on every request.</p>
            </div>
            <Controller
              control={control}
              name="headerMode"
              render={({ field }) => (
                <Tabs value={field.value} onValueChange={field.onChange}>
                  <TabsList>
                    <TabsTrigger value={HeaderRewritingMode.Headers}>Headers</TabsTrigger>
                    <TabsTrigger value={HeaderRewritingMode.BasicAuth}>Basic Auth</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />
          </div>

          {headerMode === HeaderRewritingMode.Headers ? (
            <>
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
                        <Input
                          placeholder="Bearer"
                          {...register(`headers.${i}.headerPrefix`)}
                        />
                      </FieldContent>
                    </Field>
                    <Field className="flex-1">
                      {i === 0 && <FieldLabel className="text-xs">Value</FieldLabel>}
                      <FieldContent>
                        <Controller
                          control={control}
                          name={`headers.${i}.secretKey`}
                          render={({ field }) => (
                            <SecretSelect
                              projectId={projectId}
                              environment={environment}
                              secretPath={secretPath}
                              value={field.value}
                              onChange={field.onChange}
                              isError={Boolean(errors.headers?.[i]?.secretKey)}
                            />
                          )}
                        />
                        <FieldError errors={[errors.headers?.[i]?.secretKey]} />
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
              <div>
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  onClick={() =>
                    headerFields.append({ secretKey: "", headerName: "", headerPrefix: "" })
                  }
                >
                  <PlusIcon className="mr-1 size-4" />
                  Add Header
                </Button>
              </div>
              {headersRootError && <FieldError>{headersRootError}</FieldError>}
            </>
          ) : (
            <div className="flex gap-3">
              <Field className="flex-1">
                <FieldLabel>Username</FieldLabel>
                <FieldContent>
                  <Controller
                    control={control}
                    name="basicAuth.usernameSecretKey"
                    render={({ field }) => (
                      <SecretSelect
                        projectId={projectId}
                        environment={environment}
                        secretPath={secretPath}
                        value={field.value}
                        onChange={field.onChange}
                        isError={Boolean(errors.basicAuth?.usernameSecretKey)}
                      />
                    )}
                  />
                  <FieldError errors={[errors.basicAuth?.usernameSecretKey]} />
                </FieldContent>
              </Field>
              <Field className="flex-1">
                <FieldLabel>Password</FieldLabel>
                <FieldContent>
                  <Controller
                    control={control}
                    name="basicAuth.passwordSecretKey"
                    render={({ field }) => (
                      <SecretSelect
                        projectId={projectId}
                        environment={environment}
                        secretPath={secretPath}
                        value={field.value}
                        onChange={field.onChange}
                        isError={Boolean(errors.basicAuth?.passwordSecretKey)}
                      />
                    )}
                  />
                  <FieldError errors={[errors.basicAuth?.passwordSecretKey]} />
                </FieldContent>
              </Field>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium">Credential Substitution</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="size-3.5 text-muted" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  The placeholder is delivered as an environment variable your application reads.
                  Your application sends that placeholder value in its request, and the proxy swaps
                  it for the real secret on the wire.
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="mt-1 text-xs text-muted">
              Swap a placeholder in the request for the real credential, on the wire.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border bg-container/50 p-4">
            {substitutionFields.fields.length === 0 && (
              <p className="text-center text-sm text-muted">
                No substitutions added. Click below to add.
              </p>
            )}
            {substitutionFields.fields.map((row, i) => (
              <div key={row.id} className="flex flex-col gap-3 rounded-md border border-border p-3">
                <div className="flex items-start gap-3">
                  <Field className="flex-1">
                    <FieldLabel className="text-xs">Environment Variable</FieldLabel>
                    <FieldContent>
                      <Input
                        placeholder="ENV_VAR_NAME"
                        isError={Boolean(errors.substitutions?.[i]?.placeholderKey)}
                        {...register(`substitutions.${i}.placeholderKey`)}
                      />
                      <FieldError errors={[errors.substitutions?.[i]?.placeholderKey]} />
                    </FieldContent>
                  </Field>
                  <Field className="flex-1">
                    <FieldLabel className="text-xs">Placeholder Value</FieldLabel>
                    <FieldContent>
                      <Controller
                        control={control}
                        name={`substitutions.${i}.placeholderValue`}
                        render={({ field }) => (
                          <Input readOnly value={field.value} />
                        )}
                      />
                    </FieldContent>
                  </Field>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    type="button"
                    aria-label="Remove substitution"
                    className="mt-6.5 transition-transform hover:text-danger"
                    onClick={() => substitutionFields.remove(i)}
                  >
                    <TrashIcon className="size-4" />
                  </IconButton>
                </div>
                <Field>
                  <FieldLabel className="text-xs">Replace In</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={control}
                      name={`substitutions.${i}.surfaces`}
                      render={({ field }) => (
                        <SurfaceSelect value={field.value} onChange={field.onChange} />
                      )}
                    />
                    <FieldError errors={[errors.substitutions?.[i]?.surfaces]} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel className="text-xs">Secret</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={control}
                      name={`substitutions.${i}.secretKey`}
                      render={({ field }) => (
                        <SecretSelect
                          projectId={projectId}
                          environment={environment}
                          secretPath={secretPath}
                          value={field.value}
                          onChange={field.onChange}
                          isError={Boolean(errors.substitutions?.[i]?.secretKey)}
                        />
                      )}
                    />
                    <FieldError errors={[errors.substitutions?.[i]?.secretKey]} />
                  </FieldContent>
                </Field>
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
                  placeholderKey: "",
                  placeholderValue: genPlaceholder(),
                  secretKey: "",
                  surfaces: []
                })
              }
            >
              <PlusIcon className="mr-1 size-4" />
              Add Substitution
            </Button>
          </div>
        </div>
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
