import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose } from "@app/components/v2";
import { PamResourceType, TSSHResource } from "@app/hooks/api/pam";

import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";

type Props = {
  resource?: TSSHResource;
  onSubmit: (formData: FormData) => Promise<void>;
};

const BaseSshConnectionDetailsSchema = z.object({
  host: z.string().trim().min(1, "Host is required"),
  port: z.number().int().min(1).max(65535)
});

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.SSH),
  connectionDetails: BaseSshConnectionDetailsSchema
});

type FormData = z.infer<typeof formSchema>;

export const SSHResourceForm = ({ resource, onSubmit }: Props) => {
  const isUpdate = Boolean(resource);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource ?? {
      resourceType: PamResourceType.SSH,
      connectionDetails: {
        host: "",
        port: 22
      }
    }
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <GenericResourceFields />
        <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
          <div className="mt-[0.675rem] flex items-start gap-2">
            <Controller
              name="connectionDetails.host"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Host"
                >
                  <Input placeholder="example.com or 192.168.1.1" {...field} />
                </FormControl>
              )}
            />
            <Controller
              name="connectionDetails.port"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="w-28"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Port"
                >
                  <Input type="number" {...field} />
                </FormControl>
              )}
            />
          </div>
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
            {isUpdate ? "Update Details" : "Create Resource"}
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
