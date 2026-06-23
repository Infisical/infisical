import { useState } from "react";
import { Controller, FormProvider, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faQuestionCircle, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  ModalClose,
  Switch,
  Tooltip
} from "@app/components/v2";
import { LogProvider, StreamMode } from "@app/hooks/api/auditLogStreams/enums";
import { TCustomProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/custom-provider";

import { auditLogStreamFiltersSchema, ProductsField } from "./AuditLogStreamProductsField";

type Props = {
  auditLogStream?: TCustomProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.Custom),
  credentials: z.object({
    url: z.string().url().trim().min(1).max(255),
    headers: z
      .object({
        key: z.string().min(1),
        value: z.string().min(1)
      })
      .array()
  }),
  streamMode: z.nativeEnum(StreamMode).optional(),
  ...auditLogStreamFiltersSchema.shape
});

type FormData = z.infer<typeof formSchema>;

export const CustomProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const [showPassword, setShowPassword] = useState(false);

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
          provider: LogProvider.Custom
        }
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty },
    getValues,
    setValue
  } = form;

  const headerFields = useFieldArray({
    control,
    name: "credentials.headers"
  });

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
              label="Endpoint URL"
            >
              <Input {...field} placeholder="https://example.com" />
            </FormControl>
          )}
        />

        <FormLabel label="Headers" isOptional />
        {headerFields.fields.map(({ id: headerFieldId }, i) => (
          <div key={headerFieldId} className="flex space-x-2">
            <Controller
              control={control}
              name={`credentials.headers.${i}.key`}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                  className="w-1/3"
                >
                  <Input {...field} placeholder="Authorization" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name={`credentials.headers.${i}.value`}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                  className="grow"
                >
                  <Input
                    {...field}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Bearer <token>"
                    onFocus={() => {
                      if (
                        auditLogStream &&
                        auditLogStream.credentials.headers[i] &&
                        auditLogStream.credentials.headers[i].value === "******" &&
                        field.value === "******"
                      ) {
                        field.onChange("");
                      }
                      setShowPassword(true);
                    }}
                    onBlur={() => {
                      if (
                        auditLogStream &&
                        auditLogStream.credentials.headers[i] &&
                        auditLogStream.credentials.headers[i].value === "******" &&
                        field.value === ""
                      ) {
                        field.onChange("******");
                      }
                      setShowPassword(false);
                    }}
                  />
                </FormControl>
              )}
            />
            <IconButton
              ariaLabel="delete key"
              className="h-9"
              variant="outline_bg"
              onClick={() => {
                const header = getValues("credentials.headers");
                if (header && header?.length > 1) {
                  headerFields.remove(i);
                } else {
                  setValue("credentials.headers", [{ key: "", value: "" }]);
                }
              }}
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </div>
        ))}
        <div>
          <Button
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            size="xs"
            variant="outline_bg"
            onClick={() => headerFields.append({ value: "", key: "" })}
          >
            Add Key
          </Button>
        </div>

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
                        <Tooltip className="max-w-md" content={<p>Send events as a JSON array.</p>}>
                          <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                        </Tooltip>
                      </p>
                    </Switch>
                    {isSingleStream &&
                      (isBatch ? (
                        <p className="mt-2 text-xs text-yellow">
                          Switching from single to batch delivery cannot be undone. Make sure your
                          endpoint accepts a JSON array of events.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-mineshaft-400">
                          This stream uses legacy single-event delivery (one event per request).
                          Enable batch delivery to send events as a JSON array.
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
