import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, SecretInput } from "@app/components/v2";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import { TAzureProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/azure-provider";

type Props = {
  auditLogStream?: TAzureProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.Azure),
  credentials: z.object({
    tenantId: z.string().trim().uuid(),
    clientId: z.string().trim().uuid(),
    clientSecret: z.string().trim().length(40),
    dceUrl: z.string().trim().url().min(1).max(255),
    dcrId: z
      .string()
      .trim()
      .regex(/^dcr-[0-9a-f]{32}$/, "DCR ID must be in dcr-*** format"),
    cltName: z.string().trim().min(1).max(255)
  })
});

type FormData = z.infer<typeof formSchema>;

export const AzureProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const isUpdate = Boolean(auditLogStream);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: auditLogStream ?? {
      provider: LogProvider.Azure
    }
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Controller
          name="credentials.tenantId"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Tenant ID"
            >
              <Input {...field} placeholder="00000000-0000-0000-0000-000000000000" />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.clientId"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Client ID"
            >
              <Input {...field} placeholder="00000000-0000-0000-0000-000000000000" />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.clientSecret"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Client Secret"
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.dceUrl"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Data Collection Endpoint URL"
            >
              <Input {...field} placeholder="https://example.eastus-1.ingest.monitor.azure.com" />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.dcrId"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Data Collection Rule Immutable ID"
            >
              <Input {...field} placeholder="dcr-00000000000000000000000000000000" />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.cltName"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Custom Log Table Name"
            >
              <Input {...field} placeholder="InfisicalLogs" />
            </FormControl>
          )}
        />
        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : "Create Log Stream"}
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
