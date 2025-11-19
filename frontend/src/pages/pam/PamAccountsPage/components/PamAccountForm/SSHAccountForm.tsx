import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, ModalClose } from "@app/components/v2";
import { PamResourceType, TSSHAccount } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import { SSHAuthMethod } from "@app/hooks/api/pam/types/ssh-resource";

import { BaseSshAccountSchema } from "./shared/ssh-account-schemas";
import { SshAccountFields } from "./shared/SshAccountFields";
import { GenericAccountFields, genericAccountFieldsSchema } from "./GenericAccountFields";
import { RequireMfaField } from "./RequireMfaField";

type Props = {
  account?: TSSHAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericAccountFieldsSchema.extend({
  credentials: BaseSshAccountSchema,
  // We don't support rotation for now, just feed a false value to
  // make the schema happy
  rotationEnabled: z.boolean().default(false),
  requireMfa: z.boolean().nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

export const SSHAccountForm = ({ account, onSubmit }: Props) => {
  const isUpdate = Boolean(account);

  const getDefaultCredentials = () => {
    if (!account) return undefined;

    if (account.credentials.authMethod === SSHAuthMethod.Password) {
      return {
        ...account.credentials,
        password: UNCHANGED_PASSWORD_SENTINEL
      };
    }

    if (account.credentials.authMethod === SSHAuthMethod.PublicKey) {
      return {
        ...account.credentials,
        privateKey: UNCHANGED_PASSWORD_SENTINEL
      };
    }

    return account.credentials;
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: account
      ? {
          ...account,
          credentials: getDefaultCredentials()
        }
      : {
          name: "",
          description: "",
          requireMfa: false,
          rotationEnabled: false,
          credentials: {
            authMethod: SSHAuthMethod.Password,
            username: "",
            password: ""
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
        <GenericAccountFields />
        <SshAccountFields isUpdate={isUpdate} />
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
