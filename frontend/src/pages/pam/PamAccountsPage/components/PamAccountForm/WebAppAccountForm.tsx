import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, ModalClose } from "@app/components/v2";
import { PamResourceType } from "@app/hooks/api/pam";

import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";
import { MetadataFields } from "./MetadataFields";

const formSchema = genericAccountFieldsSchema.extend({
  credentials: z.object({}).default({}),
  rotationEnabled: z.boolean().default(false)
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  account?: { name: string; description?: string | null };
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
};

export const WebAppAccountForm = ({ account, onSubmit }: Props) => {
  const isUpdate = Boolean(account);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentials: {},
          rotationEnabled: false
        }
      : {
          name: "",
          description: "",
          credentials: {},
          rotationEnabled: false
        }
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <GenericAccountFields />
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
