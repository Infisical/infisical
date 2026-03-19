import { Controller, FormProvider, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { FormControl, TextArea } from "@app/components/v2";
import { Button, SheetFooter } from "@app/components/v3";
import { KubernetesAuthMethod, PamResourceType, TKubernetesAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";
import { MetadataFields } from "./MetadataFields";

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

const formSchema = genericAccountFieldsSchema.extend({
  credentials: KubernetesServiceAccountTokenCredentialsSchema
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

export const KubernetesAccountForm = ({ account, onSubmit, closeSheet }: Props) => {
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
          <KubernetesAccountFields isUpdate={isUpdate} />
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
