import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, ModalClose } from "@app/components/v2";
import { PamResourceType, TSSHResource } from "@app/hooks/api/pam";

import { SshResourceFields } from "./shared/SshResourceFields";
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
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <GenericResourceFields />
        <SshResourceFields />
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
