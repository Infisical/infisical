import { Controller, FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormControl, Input, Select, SelectItem, TextArea } from "@app/components/v2";
import { Button, SheetFooter } from "@app/components/v3";
import { KubernetesAuthMethod, PamResourceType, TKubernetesAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";
import { MetadataFields } from "./MetadataFields";
import { RequireMfaField } from "./RequireMfaField";

type Props = {
  account?: TKubernetesAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const KubernetesServiceAccountTokenCredentialsSchema = z.object({
  authMethod: z.literal(KubernetesAuthMethod.ServiceAccountToken),
  serviceAccountToken: z.string().trim().min(1, "Service account token is required")
});

const KubernetesGatewayAuthCredentialsSchema = z.object({
  authMethod: z.literal(KubernetesAuthMethod.GatewayKubernetesAuth),
  namespace: z.string().trim().min(1, "Namespace is required").max(63),
  serviceAccountName: z.string().trim().min(1, "Service account name is required").max(253)
});

const formSchema = genericAccountFieldsSchema.extend({
  credentials: z.discriminatedUnion("authMethod", [
    KubernetesServiceAccountTokenCredentialsSchema,
    KubernetesGatewayAuthCredentialsSchema
  ]),
  requireMfa: z.boolean().nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

const KubernetesAccountFields = ({
  isUpdate,
  originalAuthMethod
}: {
  isUpdate: boolean;
  originalAuthMethod?: KubernetesAuthMethod;
}) => {
  const { control, setValue } = useFormContext<FormData>();

  const authMethod =
    useWatch({ control, name: "credentials.authMethod" }) ||
    KubernetesAuthMethod.ServiceAccountToken;

  return (
    <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
      <Controller
        name="credentials.authMethod"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            className="mb-3"
            isError={Boolean(error?.message)}
            errorText={error?.message}
            label="Authentication Method"
          >
            <Select
              value={value || KubernetesAuthMethod.ServiceAccountToken}
              onValueChange={(newAuthMethod) => {
                onChange(newAuthMethod);
                // Clear credentials from other auth methods, restoring sentinel in update mode
                setValue(
                  "credentials.serviceAccountToken" as never,
                  (newAuthMethod === KubernetesAuthMethod.ServiceAccountToken &&
                  isUpdate &&
                  originalAuthMethod === KubernetesAuthMethod.ServiceAccountToken
                    ? UNCHANGED_PASSWORD_SENTINEL
                    : undefined) as never,
                  { shouldDirty: true }
                );
                setValue("credentials.namespace" as never, undefined as never, {
                  shouldDirty: true
                });
                setValue("credentials.serviceAccountName" as never, undefined as never, {
                  shouldDirty: true
                });
              }}
              className="w-full border border-mineshaft-500"
            >
              <SelectItem value={KubernetesAuthMethod.ServiceAccountToken}>
                Service Account Token
              </SelectItem>
              <SelectItem value={KubernetesAuthMethod.GatewayKubernetesAuth}>Gateway</SelectItem>
            </Select>
          </FormControl>
        )}
      />

      {authMethod === KubernetesAuthMethod.ServiceAccountToken && (
        <Controller
          name="credentials.serviceAccountToken"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="mb-0"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Service Account Token"
              helperText="The bearer token for the service account"
            >
              <TextArea
                {...field}
                value={field.value === UNCHANGED_PASSWORD_SENTINEL ? "" : field.value || ""}
                className="min-h-32 resize-y font-mono text-xs"
                placeholder={
                  isUpdate && field.value === UNCHANGED_PASSWORD_SENTINEL
                    ? "Token unchanged - click to update"
                    : "eyJhbGciOiJSUzI1NiIsImtpZCI6..."
                }
              />
            </FormControl>
          )}
        />
      )}

      {authMethod === KubernetesAuthMethod.GatewayKubernetesAuth && (
        <>
          <Controller
            name="credentials.serviceAccountName"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                className="mb-3"
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Service Account Name"
                helperText="Name of the Kubernetes service account to impersonate"
              >
                <Input {...field} placeholder="deploy-bot" autoComplete="off" />
              </FormControl>
            )}
          />
          <Controller
            name="credentials.namespace"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                className="mb-0"
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Namespace"
                helperText="Kubernetes namespace where the service account lives"
              >
                <Input {...field} placeholder="default" autoComplete="off" />
              </FormControl>
            )}
          />
        </>
      )}
    </div>
  );
};

export const KubernetesAccountForm = ({ account, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(account);

  const getDefaultCredentials = () => {
    if (!account) return undefined;

    if (account.credentials.authMethod === KubernetesAuthMethod.ServiceAccountToken) {
      return {
        ...account.credentials,
        serviceAccountToken: UNCHANGED_PASSWORD_SENTINEL
      };
    }

    // Gateway auth has no sensitive fields
    return account.credentials;
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentials: getDefaultCredentials()
        }
      : {
          name: "",
          description: "",
          requireMfa: false,
          credentials: {
            authMethod: KubernetesAuthMethod.ServiceAccountToken,
            serviceAccountToken: ""
          }
        }
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form
        className="flex flex-1 flex-col overflow-hidden"
        onSubmit={(e) => {
          handleSubmit(onSubmit)(e);
        }}
      >
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          <GenericAccountFields />
          <KubernetesAccountFields
            isUpdate={isUpdate}
            originalAuthMethod={account?.credentials.authMethod}
          />
          <RequireMfaField />
          <MetadataFields />
        </div>
        <SheetFooter className="shrink-0 border-t">
          <Button
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
            variant="neutral"
            type="submit"
          >
            {isUpdate ? "Update Account" : "Create Account"}
          </Button>
          <Button onClick={() => closeSheet()} variant="outline" className="mr-auto" type="button">
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
