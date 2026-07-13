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

const formSchema = z.object({
  inputs: z.discriminatedUnion("authType", [
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
    })
    .nullable(),
  newName: slugSchema().optional()
});
type TForm = z.infer<typeof formSchema>;

const splitCsv = (val?: string) =>
  val
    ? val
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const hydrateInputs = (rawInputs: TailscaleInputs): TForm["inputs"] => {
  if (rawInputs.authType === TailscaleKeyAuthType.AuthKeys) {
    return {
      authType: TailscaleKeyAuthType.AuthKeys,
      apiKey: rawInputs.apiKey,
      tailnet: rawInputs.tailnet,
      description: rawInputs.description,
      tags: (rawInputs.tags ?? []).join(", "),
      reusable: rawInputs.reusable,
      preauthorized: rawInputs.preauthorized
    };
  }
  return {
    authType: TailscaleKeyAuthType.OAuthKeys,
    apiKey: rawInputs.apiKey,
    tailnet: rawInputs.tailnet,
    description: rawInputs.description,
    tags: (rawInputs.tags ?? []).join(", "),
    scopes: (rawInputs.scopes ?? []).join(", ")
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

  const handleUpdateDynamicSecret = async ({ inputs, maxTTL, defaultTTL, newName }: TForm) => {
    if (updateDynamicSecret.isPending) return;

    const builtInputs: TailscaleInputs =
      inputs.authType === TailscaleKeyAuthType.AuthKeys
        ? {
            authType: TailscaleKeyAuthType.AuthKeys,
            apiKey: inputs.apiKey,
            tailnet: inputs.tailnet,
            description: inputs.description || undefined,
            tags: splitCsv(inputs.tags),
            reusable: inputs.reusable,
            preauthorized: inputs.preauthorized
          }
        : {
            authType: TailscaleKeyAuthType.OAuthKeys,
            apiKey: inputs.apiKey,
            tailnet: inputs.tailnet,
            description: inputs.description || undefined,
            tags: splitCsv(inputs.tags),
            scopes: splitCsv(inputs.scopes)
          };

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
              name="inputs.apiKey"
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="API Key"
                  className="grow"
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                  isRequired
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
