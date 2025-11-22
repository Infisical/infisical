import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, ModalClose } from "@app/components/v2";
import { PamResourceType, TMySQLAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { BaseSqlAccountSchema } from "./shared/sql-account-schemas";
import { SqlAccountFields } from "./shared/SqlAccountFields";
import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";
import { RequireMfaField } from "./RequireMfaField";

type Props = {
  account?: TMySQLAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericAccountFieldsSchema.extend({
  credentials: BaseSqlAccountSchema,
  // We don't support rotation for now, just feed a false value to
  // make the schema happy
  rotationEnabled: z.boolean().default(false),
  requireMfa: z.boolean().nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

export const MySQLAccountForm = ({ account, onSubmit }: Props) => {
  const isUpdate = Boolean(account);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentials: {
            ...account.credentials,
            password: UNCHANGED_PASSWORD_SENTINEL
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
      <form onSubmit={handleSubmit(onSubmit)}>
        <GenericAccountFields />
        <SqlAccountFields isUpdate={isUpdate} />
        <RequireMfaField />
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
