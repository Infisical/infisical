import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  SecretInput,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import {
  DynamicSecretProviders,
  TailscaleAuthMethod,
  TailscaleKeyAuthType,
  TDynamicSecret,
  TDynamicSecretProvider
} from "@app/hooks/api/dynamicSecret/types";
import { slugSchema } from "@app/lib/schemas";

type TailscaleInputs = Extract<
  TDynamicSecretProvider,
  { type: DynamicSecretProviders.Tailscale }
>["inputs"];

const validateTTL = (val: string, ctx: z.RefinementCtx) => {
  const valMs = ms(val);
  if (valMs < 60 * 1000)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be greater than 1 minute" });
  if (valMs > ms("90d"))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 90 days" });
};

const tailscaleAuthSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal(TailscaleAuthMethod.ApiKey),
    apiKey: z.string().trim().min(1, "API key is required")
  }),
  z.object({
    method: z.literal(TailscaleAuthMethod.OAuth),
    clientId: z.string().trim().min(1, "Client ID is required"),
    clientSecret: z.string().trim().min(1, "Client secret is required")
  })
]);

const formSchema = z
  .object({
    inputs: z.discriminatedUnion("authType", [
      z.object({
        authType: z.literal(TailscaleKeyAuthType.AuthKeys),
        auth: tailscaleAuthSchema,
        tailnet: z.string().trim().min(1, "Tailnet is required"),
        description: z.string().trim().max(50).optional(),
        tags: z.string().trim().optional(),
        reusable: z.boolean().default(false),
        preauthorized: z.boolean().default(false)
      }),
      z.object({
        authType: z.literal(TailscaleKeyAuthType.OAuthKeys),
        auth: tailscaleAuthSchema,
        tailnet: z.string().trim().min(1, "Tailnet is required"),
        description: z.string().trim().max(50).optional(),
        tags: z.string().trim().optional(),
        scopes: z.string().trim().min(1, "At least one scope is required")
      }),
      z.object({
        authType: z.literal(TailscaleKeyAuthType.FederatedKeys),
        auth: tailscaleAuthSchema,
        tailnet: z.string().trim().min(1, "Tailnet is required"),
        description: z.string().trim().max(50).optional(),
        tags: z.string().trim().optional(),
        scopes: z.string().trim().min(1, "At least one scope is required"),
        issuer: z
          .string()
          .trim()
          .min(1, "Issuer is required")
          .url("Issuer must be a valid https URL"),
        subject: z.string().trim().min(1, "Subject is required"),
        audience: z.string().trim().optional()
      })
    ]),
    defaultTTL: z.string().superRefine(validateTTL),
    maxTTL: z
      .string()
      .optional()
      .superRefine((val, ctx) => {
        if (!val) return;
        validateTTL(val, ctx);
      })
      .nullable(),
    newName: slugSchema().optional()
  })
  .superRefine((val, ctx) => {
    // Tailscale requires tags on tailnet-owned auth keys (created via OAuth).
    if (
      val.inputs.authType === TailscaleKeyAuthType.AuthKeys &&
      val.inputs.auth.method === TailscaleAuthMethod.OAuth &&
      !val.inputs.tags?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inputs", "tags"],
        message: "Tags are required when creating auth keys with OAuth authentication"
      });
    }
  });
type TForm = z.infer<typeof formSchema>;

const splitCsv = (val?: string) =>
  val
    ? val
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const buildAuth = (auth: TForm["inputs"]["auth"]): TailscaleInputs["auth"] =>
  auth.method === TailscaleAuthMethod.ApiKey
    ? { method: TailscaleAuthMethod.ApiKey, apiKey: auth.apiKey }
    : {
        method: TailscaleAuthMethod.OAuth,
        clientId: auth.clientId,
        clientSecret: auth.clientSecret
      };

const assertNever = (value: never): never => {
  throw new Error(`Unhandled Tailscale auth type: ${String(value)}`);
};

const buildInputs = (inputs: TForm["inputs"], auth: TailscaleInputs["auth"]): TailscaleInputs => {
  const base = {
    auth,
    tailnet: inputs.tailnet,
    description: inputs.description || undefined,
    tags: splitCsv(inputs.tags)
  };

  switch (inputs.authType) {
    case TailscaleKeyAuthType.AuthKeys:
      return {
        ...base,
        authType: inputs.authType,
        reusable: inputs.reusable,
        preauthorized: inputs.preauthorized
      };
    case TailscaleKeyAuthType.OAuthKeys:
      return {
        ...base,
        authType: inputs.authType,
        scopes: splitCsv(inputs.scopes)
      };
    case TailscaleKeyAuthType.FederatedKeys:
      return {
        ...base,
        authType: inputs.authType,
        scopes: splitCsv(inputs.scopes),
        issuer: inputs.issuer,
        subject: inputs.subject,
        audience: inputs.audience || undefined
      };
    default:
      return assertNever(inputs);
  }
};

const hydrateInputs = (rawInputs: TailscaleInputs): TForm["inputs"] => {
  if (rawInputs.authType === TailscaleKeyAuthType.AuthKeys) {
    return {
      authType: TailscaleKeyAuthType.AuthKeys,
      auth: rawInputs.auth,
      tailnet: rawInputs.tailnet,
      description: rawInputs.description,
      tags: (rawInputs.tags ?? []).join(", "),
      reusable: rawInputs.reusable,
      preauthorized: rawInputs.preauthorized
    };
  }
  if (rawInputs.authType === TailscaleKeyAuthType.OAuthKeys) {
    return {
      authType: TailscaleKeyAuthType.OAuthKeys,
      auth: rawInputs.auth,
      tailnet: rawInputs.tailnet,
      description: rawInputs.description,
      tags: (rawInputs.tags ?? []).join(", "),
      scopes: (rawInputs.scopes ?? []).join(", ")
    };
  }
  return {
    authType: TailscaleKeyAuthType.FederatedKeys,
    auth: rawInputs.auth,
    tailnet: rawInputs.tailnet,
    description: rawInputs.description,
    tags: (rawInputs.tags ?? []).join(", "),
    scopes: (rawInputs.scopes ?? []).join(", "),
    issuer: rawInputs.issuer,
    subject: rawInputs.subject,
    audience: rawInputs.audience
  };
};

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  environment: string;
  projectSlug: string;
};

export const EditDynamicSecretTailscaleForm = ({
  onClose,
  dynamicSecret,
  secretPath,
  environment,
  projectSlug
}: Props) => {
  const {
    control,
    watch,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      defaultTTL: dynamicSecret.defaultTTL,
      maxTTL: dynamicSecret.maxTTL,
      newName: dynamicSecret.name,
      inputs: hydrateInputs(dynamicSecret.inputs as TailscaleInputs)
    }
  });

  const updateDynamicSecret = useUpdateDynamicSecret();
  const authType = watch("inputs.authType");
  const authMethod = watch("inputs.auth.method");
  const tagsRequired =
    authType === TailscaleKeyAuthType.OAuthKeys || authType === TailscaleKeyAuthType.FederatedKeys;

  const handleUpdateDynamicSecret = async ({ inputs, maxTTL, defaultTTL, newName }: TForm) => {
    if (updateDynamicSecret.isPending) return;

    const auth = buildAuth(inputs.auth);
    const builtInputs = buildInputs(inputs, auth);

    await updateDynamicSecret.mutateAsync({
      name: dynamicSecret.name,
      path: secretPath,
      projectSlug,
      environmentSlug: environment,
      data: {
        maxTTL: maxTTL || undefined,
        defaultTTL,
        inputs: builtInputs,
        newName: newName === dynamicSecret.name ? undefined : newName
      }
    });
    onClose();
    createNotification({
      type: "success",
      text: "Successfully updated dynamic secret"
    });
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleUpdateDynamicSecret)} autoComplete="off">
        <div className="flex items-center space-x-2">
          <div className="grow">
            <Controller
              control={control}
              name="newName"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Secret Name"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="dynamic-secret" />
                </FormControl>
              )}
            />
          </div>
          <div className="w-32">
            <Controller
              control={control}
              name="defaultTTL"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label={<TtlFormLabel label="Default TTL" />}
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <Input {...field} />
                </FormControl>
              )}
            />
          </div>
          <div className="w-32">
            <Controller
              control={control}
              name="maxTTL"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label={<TtlFormLabel label="Max TTL" />}
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <Input {...field} value={field.value || ""} />
                </FormControl>
              )}
            />
          </div>
        </div>
        <div>
          <div className="mb-4 border-b border-b-mineshaft-600 pb-2">Configuration</div>
          <div className="flex flex-col">
            <Controller
              name="inputs.auth.method"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Authentication Method"
                >
                  <Select
                    value={value}
                    onValueChange={onChange}
                    className="w-full border border-mineshaft-500"
                    position="popper"
                    dropdownContainerClassName="max-w-none"
                  >
                    <SelectItem value={TailscaleAuthMethod.ApiKey}>API Key</SelectItem>
                    <SelectItem value={TailscaleAuthMethod.OAuth}>OAuth</SelectItem>
                  </Select>
                </FormControl>
              )}
            />

            {authMethod === TailscaleAuthMethod.ApiKey && (
              <Controller
                control={control}
                name="inputs.auth.apiKey"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="API Key"
                    className="grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    isRequired
                    helperText="Tailscale API access token with permission to create and revoke keys."
                  >
                    <SecretInput
                      {...field}
                      containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                    />
                  </FormControl>
                )}
              />
            )}

            {authMethod === TailscaleAuthMethod.OAuth && (
              <>
                <Controller
                  control={control}
                  name="inputs.auth.clientId"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Client ID"
                      className="grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      isRequired
                    >
                      <Input {...field} placeholder="kXKWj5bUY611CNTRL" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="inputs.auth.clientSecret"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Client Secret"
                      className="grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      isRequired
                      helperText="OAuth client secret with permission to create and revoke keys."
                    >
                      <SecretInput
                        {...field}
                        containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                      />
                    </FormControl>
                  )}
                />
              </>
            )}

            <Controller
              name="inputs.authType"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Key Type"
                >
                  <Select
                    value={value}
                    onValueChange={onChange}
                    className="w-full border border-mineshaft-500"
                    position="popper"
                    dropdownContainerClassName="max-w-none"
                  >
                    <SelectItem value={TailscaleKeyAuthType.AuthKeys}>Auth Key</SelectItem>
                    <SelectItem value={TailscaleKeyAuthType.OAuthKeys}>OAuth Client</SelectItem>
                    <SelectItem value={TailscaleKeyAuthType.FederatedKeys}>
                      Federated Identity
                    </SelectItem>
                  </Select>
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="inputs.tailnet"
              defaultValue="-"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Tailnet"
                  className="grow"
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                  isRequired
                  helperText="Use '-' for the token owner's default tailnet, or provide a tailnet name (e.g. example.com)."
                >
                  <Input {...field} placeholder="-" />
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="inputs.description"
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Description"
                  className="grow"
                  isOptional
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="Created by Infisical" />
                </FormControl>
              )}
            />

            <Controller
              control={control}
              name="inputs.tags"
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Tags"
                  className="grow"
                  isOptional={!tagsRequired}
                  isRequired={tagsRequired}
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                  helperText="Comma-separated ACL tags (e.g. tag:ci, tag:prod). Required when creating auth keys with OAuth authentication."
                >
                  <Input {...field} placeholder="tag:ci, tag:prod" />
                </FormControl>
              )}
            />

            {(authType === TailscaleKeyAuthType.OAuthKeys ||
              authType === TailscaleKeyAuthType.FederatedKeys) && (
              <Controller
                control={control}
                name="inputs.scopes"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Scopes"
                    className="grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    isRequired
                    helperText="Comma-separated OAuth scopes (e.g. devices:core, auth_keys)."
                  >
                    <Input {...field} placeholder="devices:core, auth_keys" />
                  </FormControl>
                )}
              />
            )}

            {authType === TailscaleKeyAuthType.FederatedKeys && (
              <>
                <Controller
                  control={control}
                  name="inputs.issuer"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Issuer"
                      className="grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      isRequired
                      helperText="HTTPS URL of the OIDC issuer trusted for token exchange."
                    >
                      <Input {...field} placeholder="https://token.actions.githubusercontent.com" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="inputs.subject"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Subject"
                      className="grow"
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      isRequired
                      helperText="Pattern matched against the sub claim of the OIDC token (supports wildcards)."
                    >
                      <Input {...field} placeholder="repo:my-org/my-repo:*" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="inputs.audience"
                  defaultValue=""
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="Audience"
                      className="grow"
                      isOptional
                      isError={Boolean(error?.message)}
                      errorText={error?.message}
                      helperText="Leave blank to let Tailscale auto-generate one."
                    >
                      <Input {...field} />
                    </FormControl>
                  )}
                />
              </>
            )}

            {authType === TailscaleKeyAuthType.AuthKeys && (
              <div className="flex flex-col gap-3 pt-1 pb-2">
                <Controller
                  control={control}
                  name="inputs.reusable"
                  render={({ field: { value, onChange } }) => (
                    <Switch
                      className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                      id="tailscale-edit-reusable"
                      thumbClassName="bg-mineshaft-800"
                      isChecked={value}
                      onCheckedChange={onChange}
                    >
                      <p className="w-full">Reusable</p>
                    </Switch>
                  )}
                />

                <Controller
                  control={control}
                  name="inputs.preauthorized"
                  render={({ field: { value, onChange } }) => (
                    <Switch
                      className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                      id="tailscale-edit-preauthorized"
                      thumbClassName="bg-mineshaft-800"
                      isChecked={value}
                      onCheckedChange={onChange}
                    >
                      <p className="w-full">Pre-authorized</p>
                    </Switch>
                  )}
                />
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Save
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
