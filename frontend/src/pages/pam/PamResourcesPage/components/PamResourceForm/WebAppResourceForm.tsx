import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose } from "@app/components/v2";
import { PamResourceType, TWebAppResource } from "@app/hooks/api/pam";

import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";
import { MetadataFields } from "./MetadataFields";

type Props = {
  resource?: TWebAppResource;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.WebApp),
  connectionDetails: z.object({
    url: z
      .string()
      .trim()
      .min(1, "URL required")
      .refine(
        (val) => {
          try {
            const url = new URL(val);
            return url.protocol === "http:" || url.protocol === "https:";
          } catch {
            return false;
          }
        },
        { message: "Must be a valid HTTP or HTTPS URL (e.g. http://192.168.1.50:3000)" }
      )
  })
});

type FormData = z.infer<typeof formSchema>;

export const WebAppResourceForm = ({ resource, onSubmit }: Props) => {
  const isUpdate = Boolean(resource);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource ?? {
      resourceType: PamResourceType.WebApp,
      connectionDetails: {
        url: ""
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
        <GenericResourceFields />
        <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3 pb-0">
          <Controller
            name="connectionDetails.url"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Internal URL"
                helperText="The URL of the internal website accessible from the gateway's network"
              >
                <Input placeholder="http://192.168.1.50:3000" {...field} />
              </FormControl>
            )}
          />
        </div>
        <MetadataFields />
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
