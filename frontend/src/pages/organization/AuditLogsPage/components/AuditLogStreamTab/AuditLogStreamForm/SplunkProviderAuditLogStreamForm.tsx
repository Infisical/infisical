import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, SecretInput } from "@app/components/v2";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import { TSplunkProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/splunk-provider";

type Props = {
  auditLogStream?: TSplunkProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.Splunk),
  credentials: z.object({
    hostname: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .superRefine((val, ctx) => {
        if (val.includes("://")) {
          ctx.addIssue({
            code: "custom",
            message: "Hostname should not include protocol"
          });
          return;
        }

        try {
          const url = new URL(`https://${val}`);
          if (url.hostname !== val) {
            ctx.addIssue({
              code: "custom",
              message: "Must be a valid hostname without port or path"
            });
          }
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid hostname" });
        }
      }),
    token: z.string().uuid().trim().min(1)
  })
});

type FormData = z.infer<typeof formSchema>;

export const SplunkProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const isUpdate = Boolean(auditLogStream);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: auditLogStream ?? {
      provider: LogProvider.Splunk
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
          name="credentials.hostname"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Hostname"
            >
              <Input {...field} placeholder="splunk.example.com" />
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
              label="Splunk Token"
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
