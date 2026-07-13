import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  SecretInput,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import {
  DynamicSecretProviders,
  TailscaleKeyAuthType,
  TDynamicSecretProvider
} from "@app/hooks/api/dynamicSecret/types";
import { ProjectEnv } from "@app/hooks/api/types";

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

const formSchema = z.object({
  provider: z.discriminatedUnion("authType", [
    z.object({
      authType: z.literal(TailscaleKeyAuthType.AuthKeys),
      apiKey: z.string().trim().min(1, "API key is required"),
      tailnet: z.string().trim().min(1, "Tailnet is required"),
      description: z.string().trim().max(50).optional(),
      tags: z.string().trim().optional(),
      reusable: z.boolean().default(false),
      preauthorized: z.boolean().default(false)
    }),
    z.object({
      authType: z.literal(TailscaleKeyAuthType.OAuthKeys),
      apiKey: z.string().trim().min(1, "API key is required"),
      tailnet: z.string().trim().min(1, "Tailnet is required"),
      description: z.string().trim().max(50).optional(),
      tags: z.string().trim().optional(),
      scopes: z.string().trim().min(1, "At least one scope is required")
    })
  ]),
  defaultTTL: z.string().superRefine(validateTTL),
  maxTTL: z
    .string()
    .optional()
    .superRefine((val, ctx) => {
      if (!val) return;
      validateTTL(val, ctx);
    }),
  name: z.string().refine((val) => val.toLowerCase() === val, "Must be lowercase"),
  environment: z.object({ name: z.string(), slug: z.string() })
});
type TForm = z.infer<typeof formSchema>;

const splitCsv = (val?: string) =>
  val
    ? val
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environments: ProjectEnv[];
  isSingleEnvironmentMode?: boolean;
};

export const TailscaleInputForm = ({
  onCompleted,
  onCancel,
  environments,
  secretPath,
  projectSlug,
  isSingleEnvironmentMode
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    watch
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      environment: isSingleEnvironmentMode && environments.length > 0 ? environments[0] : undefined,
      provider: {
        authType: TailscaleKeyAuthType.AuthKeys,
        tailnet: "-",
        reusable: false,
        preauthorized: false
      }
    }
  });

  const createDynamicSecret = useCreateDynamicSecret();
  const authType = watch("provider.authType");

  const handleCreateDynamicSecret = async ({
    name,
    maxTTL,
    provider,
    defaultTTL,
    environment
  }: TForm) => {
    if (createDynamicSecret.isPending) return;

    const inputs: TailscaleInputs =
      provider.authType === TailscaleKeyAuthType.AuthKeys
        ? {
            authType: TailscaleKeyAuthType.AuthKeys,
            apiKey: provider.apiKey,
            tailnet: provider.tailnet,
            description: provider.description || undefined,
            tags: splitCsv(provider.tags),
            reusable: provider.reusable,
            preauthorized: provider.preauthorized
          }
        : {
            authType: TailscaleKeyAuthType.OAuthKeys,
            apiKey: provider.apiKey,
            tailnet: provider.tailnet,
            description: provider.description || undefined,
            tags: splitCsv(provider.tags),
            scopes: splitCsv(provider.scopes)
          };

    await createDynamicSecret.mutateAsync({
      provider: { type: DynamicSecretProviders.Tailscale, inputs },
      maxTTL,
      name,
      path: secretPath,
      defaultTTL,
      projectSlug,
      environmentSlug: environment.slug
    });
    onCompleted();
  };

  return (
    <div>
      <form onSubmit={handleSubmit(handleCreateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="grow">
              <Controller
                control={control}
                defaultValue=""
                name="name"
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
                defaultValue="1h"
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
                defaultValue="24h"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label={<TtlFormLabel label="Max TTL" />}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
            </div>
          </div>
          <div>
            <div className="mt-4 mb-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
              Configuration
            </div>
            <div className="flex flex-col">
              <Controller
                name="provider.authType"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="Key Type"
                  >
                    <Select
                      value={value}
                      onValueChange={(val) => onChange(val)}
                      className="w-full border border-mineshaft-500"
                      position="popper"
                      dropdownContainerClassName="max-w-none"
                    >
                      <SelectItem value={TailscaleKeyAuthType.AuthKeys}>Auth Key</SelectItem>
                      <SelectItem value={TailscaleKeyAuthType.OAuthKeys}>OAuth Client</SelectItem>
                    </Select>
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="provider.apiKey"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="API Key"
                    className="grow"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    isRequired
                    helperText="Tailscale API access token or OAuth access token with permission to create and revoke keys."
                  >
                    <SecretInput
                      {...field}
                      containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                    />
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="provider.tailnet"
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
                name="provider.description"
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
                name="provider.tags"
                defaultValue=""
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Tags"
                    className="grow"
                    isOptional
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    helperText="Comma-separated ACL tags (e.g. tag:ci, tag:prod). Required when authenticating with an OAuth token."
                  >
                    <Input {...field} placeholder="tag:ci, tag:prod" />
                  </FormControl>
                )}
              />

              {authType === TailscaleKeyAuthType.OAuthKeys && (
                <Controller
                  control={control}
                  name="provider.scopes"
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

              {authType === TailscaleKeyAuthType.AuthKeys && (
                <div className="flex flex-col gap-3 pt-1 pb-2">
                  <Controller
                    control={control}
                    name="provider.reusable"
                    render={({ field: { value, onChange } }) => (
                      <Switch
                        className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                        id="tailscale-reusable"
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
                    name="provider.preauthorized"
                    render={({ field: { value, onChange } }) => (
                      <Switch
                        className="bg-mineshaft-400/50 shadow-inner data-[state=checked]:bg-green/80"
                        id="tailscale-preauthorized"
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

              {!isSingleEnvironmentMode && (
                <Controller
                  control={control}
                  name="environment"
                  render={({ field: { value, onChange }, fieldState: { error } }) => (
                    <FormControl
                      label="Environment"
                      isError={Boolean(error)}
                      errorText={error?.message}
                    >
                      <FilterableSelect
                        options={environments}
                        value={value}
                        onChange={onChange}
                        placeholder="Select the environment to create secret in..."
                        getOptionLabel={(option) => option.name}
                        getOptionValue={(option) => option.slug}
                        menuPlacement="top"
                      />
                    </FormControl>
                  )}
                />
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Submit
          </Button>
          <Button variant="outline_bg" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
