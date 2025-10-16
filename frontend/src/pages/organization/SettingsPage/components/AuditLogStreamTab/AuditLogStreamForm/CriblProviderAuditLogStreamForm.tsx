import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, SecretInput } from "@app/components/v2";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import { TCriblProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/cribl-provider";

type Props = {
  auditLogStream?: TCriblProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.Cribl),
  credentials: z.object({
    url: z.string().url().trim().min(1).max(255),
    token: z.string().trim().min(21).max(255)
  })
});

type FormData = z.infer<typeof formSchema>;

export const CriblProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const isUpdate = Boolean(auditLogStream);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: auditLogStream ?? {
      provider: LogProvider.Cribl
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
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Cribl Stream URL"
              tooltipText={
                <>
                  To derive your Stream URL: Obtain your Cribl hostname (e.g. cribl.example.com),
                  Infisical HTTP data source port (e.g. 20000), and HTTP event API path (e.g.
                  /infisical).
                  <br />
                  <br />
                  If your Infisical Data Source has TLS enabled, then use the https protocol.
                </>
              }
            >
              <Input
                {...field}
                placeholder="http://default.main.example.cribl.cloud:20000/infisical/_bulk"
              />
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
              label="Cribl Stream Token"
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
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
