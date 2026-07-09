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
        headerPrefix: h.headerPrefix || null
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
        <FieldLabel>Service name</FieldLabel>
        <FieldContent>
          <Input placeholder="stripe-api" {...register("name")} />
          <FieldDescription>Lowercase letters, numbers, and hyphens only.</FieldDescription>
          {errors.name && <FieldError>{errors.name.message}</FieldError>}
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Host pattern</FieldLabel>
        <FieldContent>
          <Input placeholder="api.stripe.com" {...register("hostPattern")} />
          <FieldDescription>
            Outbound requests to a matching host are intercepted. Wildcards supported (e.g.
            *.stripe.com).
          </FieldDescription>
          {errors.hostPattern && <FieldError>{errors.hostPattern.message}</FieldError>}
        </FieldContent>
      </Field>

      {/* Header Rewriting */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Header Rewriting</p>
            <p className="text-muted-foreground text-xs">Sets these headers on every request.</p>
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
          <div className="flex flex-col gap-2">
            {headerFields.fields.map((row, i) => (
              <div key={row.id} className="flex items-end gap-2">
                <Field className="flex-1">
                  <FieldLabel>Name</FieldLabel>
                  <Input placeholder="Authorization" {...register(`headers.${i}.headerName`)} />
                </Field>
                <Field className="w-28">
                  <FieldLabel>Prefix</FieldLabel>
                  <Input placeholder="Bearer" {...register(`headers.${i}.headerPrefix`)} />
                </Field>
                <Field className="flex-1">
                  <FieldLabel>Value</FieldLabel>
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
                      />
                    )}
                  />
                </Field>
                <IconButton
                  type="button"
                  variant="ghost"
                  aria-label="Remove header"
                  onClick={() => headerFields.remove(i)}
                >
                  <XIcon className="size-4" />
                </IconButton>
              </div>
            ))}
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
          </div>
        ) : (
          <div className="flex gap-2">
            <Field className="flex-1">
              <FieldLabel>Username</FieldLabel>
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
                  />
                )}
              />
            </Field>
            <Field className="flex-1">
              <FieldLabel>Password</FieldLabel>
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
                  />
                )}
              />
            </Field>
          </div>
        )}
      </div>

      {/* Credential Substitution */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-sm font-medium">Credential Substitution</p>
          <p className="text-muted-foreground text-xs">
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
              <div className="flex items-end gap-2">
                <Field className="flex-1">
                  <FieldLabel>Set env var to the placeholder</FieldLabel>
                  <Input
                    placeholder="ENV_VAR_NAME"
                    {...register(`substitutions.${i}.placeholderKey`)}
                  />
                </Field>
                <Field className="flex-1">
                  <FieldLabel>Placeholder value</FieldLabel>
                  <Controller
                    control={control}
                    name={`substitutions.${i}.placeholderValue`}
                    render={({ field }) => <Input readOnly value={field.value} />}
                  />
                </Field>
                <IconButton
                  type="button"
                  variant="ghost"
                  aria-label="Remove substitution"
                  onClick={() => substitutionFields.remove(i)}
                >
                  <XIcon className="size-4" />
                </IconButton>
              </div>
              <Field>
                <FieldLabel>and replace it in</FieldLabel>
                <Controller
                  control={control}
                  name={`substitutions.${i}.surfaces`}
                  render={({ field }) => (
                    <SurfaceSelect value={field.value} onChange={field.onChange} />
                  )}
                />
              </Field>
              <Field>
                <FieldLabel>with value of</FieldLabel>
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
                    />
                  )}
                />
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
