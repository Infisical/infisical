import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, SecretInput } from "@app/components/v2";
import { LogProvider, REDACTED_CREDENTIAL_VALUE } from "@app/hooks/api/auditLogStreams/enums";
import { TSumoLogicProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/sumo-logic-provider";

import { auditLogStreamFiltersSchema, ProductsField } from "./AuditLogStreamProductsField";

type Props = {
  auditLogStream?: TSumoLogicProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.SumoLogic),
  credentials: z.object({
    url: z.string().url().trim().min(1).max(255),
    token: z.string().trim().max(255).optional()
  }),
  ...auditLogStreamFiltersSchema.shape
});

type FormData = z.infer<typeof formSchema>;

export const SumoLogicProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const isUpdate = Boolean(auditLogStream);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: auditLogStream ?? {
      provider: LogProvider.SumoLogic
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
              label="HTTP Source Address"
              tooltipText={
                <>The HTTP Source Address from your Sumo Logic HTTP Logs and Metrics Source.</>
              }
            >
              <Input
                {...field}
                placeholder="https://endpoint.collection.sumologic.com/receiver/v1/http"
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
              isOptional
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Auth Token"
              tooltipText={
                <>
                  When set, it is sent as an <code>x-sumo-token</code> header. Use this if you
                  prefer header based authentication; otherwise leave it empty and rely on the token
                  in the URL.
                </>
              }
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => {
                  if (
                    auditLogStream?.credentials.token === REDACTED_CREDENTIAL_VALUE &&
                    value === REDACTED_CREDENTIAL_VALUE
                  ) {
                    onChange("");
                  }
                }}
                onBlur={() => {
                  if (
                    auditLogStream?.credentials.token === REDACTED_CREDENTIAL_VALUE &&
                    value === ""
                  ) {
                    onChange(REDACTED_CREDENTIAL_VALUE);
                  }
                }}
              />
            </FormControl>
          )}
        />

        <div className="mt-6">
          <ProductsField />
        </div>

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
