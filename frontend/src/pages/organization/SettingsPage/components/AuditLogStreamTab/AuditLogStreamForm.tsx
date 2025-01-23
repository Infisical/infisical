import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, FormLabel, IconButton, Input, Spinner } from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
  useCreateAuditLogStream,
  useGetAuditLogStreamDetails,
  useUpdateAuditLogStream
} from "@app/hooks/api";

type Props = {
  id?: string;
  onClose: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const formSchema = z.object({
  url: z.string().url().min(1),
  headers: z
    .object({
      key: z.string(),
      value: z.string()
    })
    .array()
    .optional()
});
type TForm = z.infer<typeof formSchema>;

export const AuditLogStreamForm = ({ id = "", onClose }: Props) => {
  const isEdit = Boolean(id);
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const auditLogStream = useGetAuditLogStreamDetails(id);
  const createAuditLogStream = useCreateAuditLogStream();
  const updateAuditLogStream = useUpdateAuditLogStream();

  const {
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { isSubmitting }
  } = useForm<TForm>({
    values: auditLogStream?.data,
    defaultValues: {
      headers: [{ key: "", value: "" }]
    }
  });

  const headerFields = useFieldArray({
    control,
    name: "headers"
  });

  const handleAuditLogStreamEdit = async ({ headers, url }: TForm) => {
    if (!id) return;
    try {
      await updateAuditLogStream.mutateAsync({
        id,
        orgId,
        headers,
        url
      });
      createNotification({
        type: "success",
        text: "Successfully updated stream"
      });
      onClose();
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to update stream"
      });
    }
  };

  const handleFormSubmit = async ({ headers = [], url }: TForm) => {
    if (isSubmitting) return;
    const sanitizedHeaders = headers.filter(({ key, value }) => Boolean(key) && Boolean(value));
    const streamHeaders = sanitizedHeaders.length ? sanitizedHeaders : undefined;
    if (isEdit) {
      await handleAuditLogStreamEdit({ headers: streamHeaders, url });
      return;
    }
    try {
      await createAuditLogStream.mutateAsync({
        orgId,
        headers: streamHeaders,
        url
      });
      createNotification({
        type: "success",
        text: "Successfully created stream"
      });
      onClose();
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: (err as Error)?.message ?? "Failed to create stream"
      });
    }
  };

  if (isEdit && auditLogStream.isPending) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} autoComplete="off">
      <div>
        <Controller
          control={control}
          name="url"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Endpoint URL"
              isError={Boolean(error?.message)}
              errorText={error?.message}
            >
              <Input {...field} />
            </FormControl>
          )}
        />
        <FormLabel label="Headers" isOptional />
        {headerFields.fields.map(({ id: headerFieldId }, i) => (
          <div key={headerFieldId} className="flex space-x-2">
            <Controller
              control={control}
              name={`headers.${i}.key`}
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
              name={`headers.${i}.value`}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  isError={Boolean(error?.message)}
                  errorText={error?.message}
                  className="flex-grow"
                >
                  <Input
                    {...field}
                    type="password"
                    placeholder="Bearer <token>"
                    autoComplete="new-password"
                  />
                </FormControl>
              )}
            />
            <IconButton
              ariaLabel="delete key"
              className="h-9"
              variant="outline_bg"
              onClick={() => {
                const header = getValues("headers");
                if (header && header?.length > 1) {
                  headerFields.remove(i);
                } else {
                  setValue("headers", [{ key: "", value: "" }]);
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
      </div>
      <div className="mt-8 flex items-center">
        <Button className="mr-4" type="submit" isLoading={isSubmitting}>
          {isEdit ? "Save" : "Create"}
        </Button>
        <Button variant="plain" colorSchema="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
