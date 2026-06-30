import { Controller, FormProvider, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FormControl,
  Input,
  ModalClose,
  SecretInput,
  Switch,
  Tooltip
} from "@app/components/v2";
import { LogProvider, StreamMode } from "@app/hooks/api/auditLogStreams/enums";
import { TCriblProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/cribl-provider";

import { auditLogStreamFiltersSchema, ProductsField } from "./AuditLogStreamProductsField";

type Props = {
  auditLogStream?: TCriblProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.Cribl),
  credentials: z.object({
    url: z.string().url().trim().min(1).max(255),
    token: z.string().trim().min(21).max(255)
  }),
  streamMode: z.nativeEnum(StreamMode).optional(),
  ...auditLogStreamFiltersSchema.shape
});

type FormData = z.infer<typeof formSchema>;

export const CriblProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const isUpdate = Boolean(auditLogStream);
  // Only streams already on "single" (legacy) can change mode — and only to "batch".
  const isSingleStream = auditLogStream?.streamMode === StreamMode.Single;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: auditLogStream
      ? {
          ...auditLogStream,
          // Any payload missing streamMode (legacy stream, partial cache) resolves to
          // Batch — the system default — so the switch reflects the true mode rather
          // than rendering unchecked.
          streamMode: auditLogStream.streamMode ?? StreamMode.Batch
        }
      : {
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
        {isUpdate && (
          <div className="mt-6">
            <Controller
              control={control}
              name="streamMode"
              render={({ field }) => {
                const isBatch = field.value === StreamMode.Batch;
                return (
                  <div>
                    <Switch
                      id="stream-batch-mode"
                      isChecked={isBatch}
                      isDisabled={!isSingleStream}
                      onCheckedChange={(checked) =>
                        field.onChange(checked ? StreamMode.Batch : StreamMode.Single)
                      }
                    >
                      <p className="text-sm">
                        Batch delivery
                        <Tooltip
                          className="max-w-md"
                          content={<p>Send events as a newline-delimited JSON (NDJSON) batch.</p>}
                        >
                          <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                        </Tooltip>
                      </p>
                    </Switch>
                    {isSingleStream &&
                      (isBatch ? (
                        <p className="mt-2 text-xs text-yellow">
                          Switching from single to batch delivery cannot be undone. Make sure your
                          Cribl source accepts newline-delimited JSON (NDJSON) batches.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-mineshaft-400">
                          This stream uses legacy single-event delivery (one event per request).
                          Enable batch delivery to send events as a newline-delimited JSON (NDJSON)
                          batch.
                        </p>
                      ))}
                  </div>
                );
              }}
            />
          </div>
        )}

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
