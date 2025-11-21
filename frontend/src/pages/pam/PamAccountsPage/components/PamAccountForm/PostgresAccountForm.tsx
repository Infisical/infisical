import { useEffect, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, ModalClose } from "@app/components/v2";
import {
  PamResourceType,
  TPostgresAccount,
  TPostgresResource,
  useGetPamResourceById
} from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

import { baseSqlAccountFieldsSchema, SqlAccountFields } from "./shared/SqlAccountFields";
import { GenericAccountFields } from "./GenericAccountFields";
import { RotateAccountFields } from "./RotateAccountFields";

type Props = {
  account?: TPostgresAccount;
  resourceId?: string;
  resourceType?: PamResourceType;
  onSubmit: (formData: FormData) => Promise<void>;
};

type FormData = z.infer<typeof baseSqlAccountFieldsSchema>;

export const PostgresAccountForm = ({ account, resourceId, resourceType, onSubmit }: Props) => {
  const isUpdate = Boolean(account);

  const form = useForm<FormData>({
    resolver: zodResolver(baseSqlAccountFieldsSchema),
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

  const [rotationCredentialsConfigured, setRotationCredentialsConfigured] = useState(false);

  const { data: resource } = useGetPamResourceById(resourceType, resourceId, {
    enabled: !account && !!resourceId && !!resourceType
  });

  useEffect(() => {
    if (account) {
      setRotationCredentialsConfigured(account.resource.rotationCredentialsConfigured);
    } else {
      setRotationCredentialsConfigured(
        !!(resource as TPostgresResource)?.rotationAccountCredentials
      );
    }
  }, [account, resource]);

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          handleSubmit(onSubmit)(e);
        }}
      >
        <GenericAccountFields />
        <SqlAccountFields isUpdate={isUpdate} />
        <RotateAccountFields rotationCredentialsConfigured={rotationCredentialsConfigured} />
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
