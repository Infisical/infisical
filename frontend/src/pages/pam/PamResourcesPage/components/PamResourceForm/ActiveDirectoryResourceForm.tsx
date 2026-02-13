import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose } from "@app/components/v2";
import { PamResourceType, TActiveDirectoryResource } from "@app/hooks/api/pam";

import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";

type Props = {
  resource?: TActiveDirectoryResource;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.ActiveDirectory),
  connectionDetails: z.object({
    domain: z.string().trim().min(1, "Domain is required"),
    dcAddress: z.string().trim().min(1, "DC address is required"),
    port: z.coerce.number().int().min(1).max(65535)
  })
});

type FormData = z.infer<typeof formSchema>;

export const ActiveDirectoryResourceForm = ({ resource, onSubmit }: Props) => {
  const isUpdate = Boolean(resource);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource ?? {
      resourceType: PamResourceType.ActiveDirectory,
      connectionDetails: {
        domain: "",
        dcAddress: "",
        port: 389
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
        <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3 pb-0">
          <Controller
            name="connectionDetails.domain"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                className="mb-3"
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Domain"
              >
                <Input placeholder="corp.example.com" {...field} />
              </FormControl>
            )}
          />
          <div className="flex items-start gap-2">
            <Controller
              name="connectionDetails.dcAddress"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="DC Address"
                >
                  <Input placeholder="10.0.1.10 or dc.corp.example.com" {...field} />
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
