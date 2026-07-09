import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Empty,
  EmptyDescription,
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
  TabsTrigger
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
      // pre-fill a bearer header on create (mockup behavior)
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

  // On edit, switching header modes discards the other mode's credentials on save (they are
  // mutually exclusive). Warn so the change is not silent.
  const originalHeaderMode = proxiedService?.credentials.some((c) => c.headerPurpose)
    ? HeaderRewritingMode.BasicAuth
    : HeaderRewritingMode.Headers;
  const showModeSwitchWarning = isEdit && headerMode !== originalHeaderMode;

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
          projectId,
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
    } catch {
      createNotification({
        text: `Failed to ${isEdit ? "update" : "create"} proxied service`,
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <Controller
        control={control}
        name="isEnabled"
        render={({ field }) => (
          <Field orientation="horizontal">
            <FieldLabel>Enabled</FieldLabel>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </Field>
        )}
      />

      <Field>
        <FieldLabel>Service Name</FieldLabel>
        <FieldContent>
          <Input placeholder="stripe-api" {...register("name")} />
          <FieldDescription>Lowercase letters, numbers, and hyphens only.</FieldDescription>
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Host Pattern</FieldLabel>
        <FieldContent>
          <Input placeholder="api.stripe.com" {...register("hostPattern")} />
          <FieldDescription>
            Outbound requests to a matching host are intercepted. Wildcards (e.g. *.stripe.com) and
            comma-separated patterns are supported.
          </FieldDescription>
          {errors.hostPattern && <FieldError>{errors.hostPattern.message}</FieldError>}
        </FieldContent>
      </Field>

      {/* Header Rewriting */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Header Rewriting</p>
            <p className="text-sm text-bunker-300">Sets these headers on every request.</p>
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

        {showModeSwitchWarning && (
          <p className="text-xs text-yellow">
            Switching auth type will replace the{" "}
            {originalHeaderMode === HeaderRewritingMode.BasicAuth ? "Basic Auth" : "header"}{" "}
            credentials on this service when you save.
          </p>
        )}

        {headerMode === HeaderRewritingMode.Headers ? (
          <div className="flex flex-col gap-2">
            {headerFields.fields.length === 0 ? (
              <Empty className="border border-dashed py-6">
                <EmptyDescription>No headers added</EmptyDescription>
              </Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {/* shared column headers */}
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium text-foreground">Name</span>
                  <span className="w-28 text-sm font-medium text-foreground">Prefix</span>
                  <span className="flex-1 text-sm font-medium text-foreground">Value</span>
                  <span className="w-9" />
                </div>
                {headerFields.fields.map((row, i) => {
                  const rowError =
                    errors.headers?.[i]?.headerName?.message ??
                    errors.headers?.[i]?.secretKey?.message;
                  return (
                    <div key={row.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Input
                          className="flex-1"
                          placeholder="Authorization"
                          {...register(`headers.${i}.headerName`)}
                        />
                        <Input
                          className="w-28"
                          placeholder="Bearer"
                          {...register(`headers.${i}.headerPrefix`)}
                        />
                        <div className="flex-1">
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
                        </div>
                        <IconButton
                          type="button"
                          variant="ghost"
                          aria-label="Remove header"
                          onClick={() => headerFields.remove(i)}
                        >
                          <XIcon className="size-4" />
                        </IconButton>
                      </div>
                      {rowError && <FieldError>{rowError}</FieldError>}
                    </div>
                  );
                })}
              </div>
            )}
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  headerFields.append({ secretKey: "", headerName: "", headerPrefix: "" })
                }
              >
                <PlusIcon className="size-4" />
                Add Header
              </Button>
            </div>
            {headersRootError && <FieldError>{headersRootError}</FieldError>}
          </div>
        ) : (
          <div className="flex gap-2">
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
                {errors.basicAuth?.usernameSecretKey && (
                  <FieldError>{errors.basicAuth.usernameSecretKey.message}</FieldError>
                )}
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
                {errors.basicAuth?.passwordSecretKey && (
                  <FieldError>{errors.basicAuth.passwordSecretKey.message}</FieldError>
                )}
              </FieldContent>
            </Field>
          </div>
        )}
      </div>

      {/* Credential Substitution */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">Credential Substitution</p>
          <p className="text-sm text-bunker-300">
            Swap a placeholder in the request for the real credential, on the wire.
          </p>
        </div>

        {substitutionFields.fields.length === 0 ? (
          <Empty className="border border-dashed py-6">
            <EmptyDescription>No substitutions added</EmptyDescription>
          </Empty>
        ) : (
          substitutionFields.fields.map((row, i) => (
            <div key={row.id} className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <Field className="flex-1">
                  <FieldLabel>Environment Variable</FieldLabel>
                  <FieldContent>
                    <Input
                      placeholder="ENV_VAR_NAME"
                      {...register(`substitutions.${i}.placeholderKey`)}
                    />
                    {errors.substitutions?.[i]?.placeholderKey && (
                      <FieldError>{errors.substitutions[i]?.placeholderKey?.message}</FieldError>
                    )}
                  </FieldContent>
                </Field>
                <Field className="flex-1">
                  <FieldLabel>Placeholder Value</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={control}
                      name={`substitutions.${i}.placeholderValue`}
                      render={({ field }) => <Input readOnly value={field.value} />}
                    />
                  </FieldContent>
                </Field>
                <IconButton
                  type="button"
                  variant="ghost"
                  aria-label="Remove substitution"
                  className="mt-6"
                  onClick={() => substitutionFields.remove(i)}
                >
                  <XIcon className="size-4" />
                </IconButton>
              </div>
              <Field>
                <FieldLabel>Replace In</FieldLabel>
                <FieldContent>
                  <Controller
                    control={control}
                    name={`substitutions.${i}.surfaces`}
                    render={({ field }) => (
                      <SurfaceSelect value={field.value} onChange={field.onChange} />
                    )}
                  />
                  {errors.substitutions?.[i]?.surfaces && (
                    <FieldError>{errors.substitutions[i]?.surfaces?.message}</FieldError>
                  )}
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel>Secret</FieldLabel>
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
                  {errors.substitutions?.[i]?.secretKey && (
                    <FieldError>{errors.substitutions[i]?.secretKey?.message}</FieldError>
                  )}
                </FieldContent>
              </Field>
            </div>
          ))
        )}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              substitutionFields.append({
                placeholderKey: "",
                placeholderValue: genPlaceholder(),
                secretKey: "",
                surfaces: []
              })
            }
          >
            <PlusIcon className="size-4" />
            Add Substitution
          </Button>
        </div>
      </div>

      <SheetFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="project" isPending={isSubmitting} isDisabled={isSubmitting}>
          {isEdit ? "Save Changes" : "Create"}
        </Button>
      </SheetFooter>
    </form>
  );
};
