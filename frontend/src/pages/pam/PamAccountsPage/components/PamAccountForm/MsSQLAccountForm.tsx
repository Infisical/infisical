import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, SheetFooter } from "@app/components/v3";
import { PamResourceType, TMsSQLAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { BaseSqlAccountSchema } from "./shared/sql-account-schemas";
import { SqlAccountFields } from "./shared/SqlAccountFields";
import {
  AccountPolicyField,
  GenericAccountFields,
  genericAccountFieldsSchema
} from "./GenericAccountFields";
import { MetadataFields } from "./MetadataFields";
import { RequireMfaField } from "./RequireMfaField";

type Props = {
  account?: TMsSQLAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const formSchema = genericAccountFieldsSchema.extend({
  credentials: BaseSqlAccountSchema,
  requireMfa: z.boolean().nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

export const MsSQLAccountForm = ({ account, onSubmit, closeSheet }: Props) => {
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
      <form className="flex flex-1 flex-col overflow-hidden" onSubmit={handleSubmit(onSubmit)}>
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          <GenericAccountFields />
          <SqlAccountFields isUpdate={isUpdate} />
          <RequireMfaField />
          <AccountPolicyField />
          <MetadataFields />
        </div>
        <SheetFooter className="shrink-0 border-t">
          <Button
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
            variant="neutral"
            type="submit"
          >
            {isUpdate ? "Update Account" : "Add Account"}
          </Button>
          <Button onClick={() => closeSheet()} variant="outline" className="mr-auto" type="button">
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
