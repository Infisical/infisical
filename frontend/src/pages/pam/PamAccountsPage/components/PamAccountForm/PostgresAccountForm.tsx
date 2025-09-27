import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, ModalClose } from "@app/components/v2";
import { TPostgresAccount } from "@app/hooks/api/pam";

import { BaseSqlAccountSchema } from "./shared/sql-account-schemas";
import { SqlAccountFields } from "./shared/SqlAccountFields";
import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";

type Props = {
  account?: TPostgresAccount;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericAccountFieldsSchema.extend({
  credentials: BaseSqlAccountSchema
});

type FormData = z.infer<typeof formSchema>;

export const PostgresAccountForm = ({ account, onSubmit }: Props) => {
  const isUpdate = Boolean(account);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentials: {
            ...account.credentials,
            password: "******"
          }
        }
      : undefined
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          handleSubmit(onSubmit)(e);
        }}
      >
        <GenericAccountFields />
        <SqlAccountFields isUpdate={isUpdate} />
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
