import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FormControl,
  ModalClose,
  SecretInput,
  Select,
  SelectItem
} from "@app/components/v2";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import { TDatadogProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/datadog-provider";

type Props = {
  auditLogStream?: TDatadogProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.Datadog),
  credentials: z.object({
    url: z.string().url().trim().min(1).max(255),
    token: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{32}$/, "Invalid Datadog API key format")
  })
});

type FormData = z.infer<typeof formSchema>;

const DATADOG_ENDPOINTS = {
  "Datadog US1": "https://http-intake.logs.datadoghq.com/api/v2/logs",
  "Datadog US3": "https://http-intake.logs.us3.datadoghq.com/api/v2/logs",
  "Datadog US5": "https://http-intake.logs.us5.datadoghq.com/api/v2/logs",
  "Datadog EU": "https://http-intake.logs.datadoghq.eu/api/v2/logs",
  "Datadog AP1": "https://http-intake.logs.ap1.datadoghq.com/api/v2/logs",
  "Datadog AP2": "https://http-intake.logs.ap2.datadoghq.com/api/v2/logs",
  "Datadog GovCloud (US1-FED)": "https://http-intake.logs.ddog-gov.com/api/v2/logs"
};

export const DatadogProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const isUpdate = Boolean(auditLogStream);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: auditLogStream ?? {
      provider: LogProvider.Datadog,
      credentials: {
        url: DATADOG_ENDPOINTS["Datadog US1"]
      }
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
          name="credentials.url"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Datadog Region"
              helperText={value}
            >
              <Select
                value={value}
                onValueChange={(val) => onChange(val)}
                className="w-full border border-mineshaft-500"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.entries(DATADOG_ENDPOINTS).map(([k, v]) => {
                  return (
                    <SelectItem value={v} key={k}>
                      {k}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />
        <Controller
          name="credentials.token"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Datadog Token"
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
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
