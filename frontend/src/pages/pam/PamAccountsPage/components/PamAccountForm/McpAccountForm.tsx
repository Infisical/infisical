import { Controller, FormProvider, useFieldArray, useForm } from "react-hook-form";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, FormLabel, IconButton, Input, ModalClose } from "@app/components/v2";
import { PamResourceType, TMcpAccount } from "@app/hooks/api/pam";

import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";

type Props = {
  account?: TMcpAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericAccountFieldsSchema.extend({
  credentials: z.object({
    headers: z
      .object({
        key: z.string(),
        value: z.string()
      })
      .array()
  }),
  // We don't support rotation for now, just feed a false value to
  // make the schema happy
  rotationEnabled: z.boolean().default(false)
});

type FormData = z.infer<typeof formSchema>;

export const McpAccountForm = ({ account, onSubmit }: Props) => {
  const isUpdate = Boolean(account);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentials: {
            ...account.credentials
          }
        }
      : undefined
  });

  const headers = useFieldArray({
    control: form.control,
    name: "credentials.headers"
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <GenericAccountFields />
        <div>
          <FormLabel label="Headers" tooltipText="MCP OAuth 2.1 is supported" />
        </div>
        {headers.fields.map(({ id: metadataFieldId }, i) => (
          <div key={metadataFieldId} className="flex items-end space-x-2">
            <div className="grow">
              {i === 0 && <span className="text-xs text-mineshaft-400">Key</span>}
              <Controller
                control={control}
                name={`credentials.headers.${i}.key`}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    className="mb-0"
                  >
                    <Input {...field} placeholder="Authorization" />
                  </FormControl>
                )}
              />
            </div>
            <div className="grow">
              {i === 0 && (
                <FormLabel label="Value" className="text-xs text-mineshaft-400" isOptional />
              )}
              <Controller
                control={control}
                name={`credentials.headers.${i}.value`}
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    className="mb-0"
                  >
                    <Input {...field} placeholder="Bearer ***" />
                  </FormControl>
                )}
              />
            </div>
            <IconButton
              ariaLabel="delete key"
              className="bottom-0.5 h-9"
              variant="outline_bg"
              onClick={() => headers.remove(i)}
            >
              <FontAwesomeIcon icon={faTrash} />
            </IconButton>
          </div>
        ))}
        <div className="mt-2 flex justify-end">
          <Button
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
            size="xs"
            variant="outline_bg"
            onClick={() => headers.append({ key: "", value: "" })}
          >
            Add Header
          </Button>
        </div>
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
