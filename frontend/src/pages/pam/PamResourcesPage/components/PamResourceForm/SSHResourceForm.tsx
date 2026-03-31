import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  SheetFooter,
  UnstableInput
} from "@app/components/v3";
import { PamResourceType, TSSHResource } from "@app/hooks/api/pam";

import { SshCaSetupSection } from "../../../components/SshCaSetupSection";
import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";
import { MetadataFields } from "./MetadataFields";

type Props = {
  resource?: TSSHResource;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const BaseSshConnectionDetailsSchema = z.object({
  host: z.string().trim().min(1, "Host is required"),
  port: z.coerce.number().int().min(1).max(65535)
});

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.SSH),
  connectionDetails: BaseSshConnectionDetailsSchema
});

type FormData = z.infer<typeof formSchema>;

export const SSHResourceForm = ({ resource, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(resource);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource
      ? {
          ...resource,
          gateway: resource.gatewayId ? { id: resource.gatewayId, name: "" } : undefined
        }
      : {
          resourceType: PamResourceType.SSH,
          gateway: undefined,
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
      <form
        onSubmit={handleSubmit((data) => onSubmit(data as FormData))}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          <GenericResourceFields />
          <div className="flex items-start gap-2">
            <Controller
              name="connectionDetails.host"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="flex-1">
                  <FieldLabel>Host</FieldLabel>
                  <FieldContent>
                    <UnstableInput
                      {...field}
                      isError={Boolean(error)}
                      placeholder="example.com or 192.168.1.1"
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              name="connectionDetails.port"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="w-28">
                  <FieldLabel>Port</FieldLabel>
                  <FieldContent>
                    <UnstableInput type="number" {...field} isError={Boolean(error)} />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          </div>
          {isUpdate && <SshCaSetupSection resourceId={resource!.id} isOptional className="mb-4" />}
          <MetadataFields />
        </div>
        <SheetFooter className="shrink-0 border-t">
          <Button
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
            variant="neutral"
            type="submit"
          >
            {isUpdate ? "Update Details" : "Create"}
          </Button>
          <Button onClick={closeSheet} variant="outline" className="mr-auto" type="button">
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
