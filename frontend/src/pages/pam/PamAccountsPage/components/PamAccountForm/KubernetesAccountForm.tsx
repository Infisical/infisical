import { Controller, FormProvider, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, ModalClose, TextArea } from "@app/components/v2";
import { KubernetesAuthMethod, PamResourceType, TKubernetesAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";

type Props = {
  account?: TKubernetesAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
};

const KubernetesServiceAccountTokenCredentialsSchema = z.object({
  authMethod: z.literal(KubernetesAuthMethod.ServiceAccountToken),
  serviceAccountToken: z.string().trim().min(1, "Service account token is required")
});

const formSchema = genericAccountFieldsSchema.extend({
  credentials: KubernetesServiceAccountTokenCredentialsSchema,
  // We don't support rotation for now, just feed a false value to
  // make the schema happy
  rotationEnabled: z.boolean().default(false)
});

type FormData = z.infer<typeof formSchema>;

const KubernetesAccountFields = ({ isUpdate }: { isUpdate: boolean }) => {
  const { control } = useFormContext<FormData>();

  return (
    <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
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
    </div>
  );
};

export const KubernetesAccountForm = ({ account, onSubmit }: Props) => {
  const isUpdate = Boolean(account);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentials: {
            ...account.credentials,
            serviceAccountToken: UNCHANGED_PASSWORD_SENTINEL
          }
        }
      : {
          name: "",
          description: "",
          credentials: {
            authMethod: KubernetesAuthMethod.ServiceAccountToken,
            serviceAccountToken: ""
          },
          rotationEnabled: false
        }
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          handleSubmit(onSubmit)(e);
        }}
      >
        <GenericAccountFields />
        <KubernetesAccountFields isUpdate={isUpdate} />
        <div className="mt-6 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Account" : "Create Account"}
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
