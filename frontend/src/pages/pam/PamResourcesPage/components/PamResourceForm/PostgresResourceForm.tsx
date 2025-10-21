import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, ModalClose } from "@app/components/v2";
import { PamResourceType, TPostgresResource } from "@app/hooks/api/pam";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";
import { BaseSqlAccountSchema } from "@app/pages/pam/PamAccountsPage/components/PamAccountForm/shared/sql-account-schemas";

import { BaseSqlResourceSchema } from "./shared/sql-resource-schemas";
import { SqlResourceFields } from "./shared/SqlResourceFields";
import { SqlRotateAccountFields } from "./shared/SqlRotateAccountFields";
import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";

type Props = {
  resource?: TPostgresResource;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.Postgres),
  connectionDetails: BaseSqlResourceSchema,
  rotationAccountCredentials: BaseSqlAccountSchema.nullable().optional()
});

type FormData = z.infer<typeof formSchema>;

export const PostgresResourceForm = ({ resource, onSubmit }: Props) => {
  const isUpdate = Boolean(resource);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource
      ? {
          ...resource,
          rotationAccountCredentials: resource.rotationAccountCredentials
            ? {
                ...resource.rotationAccountCredentials,
                password: UNCHANGED_PASSWORD_SENTINEL
              }
            : resource.rotationAccountCredentials
        }
      : {
          resourceType: PamResourceType.Postgres,
          connectionDetails: {
            host: "",
            port: 5432,
            database: "default",
            sslEnabled: true,
            sslRejectUnauthorized: true,
            sslCertificate: undefined
          }
        }
  });

  const {
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          setSelectedTabIndex(0);
          handleSubmit(onSubmit)(e);
        }}
      >
        <GenericResourceFields />
        <SqlResourceFields
          selectedTabIndex={selectedTabIndex}
          setSelectedTabIndex={setSelectedTabIndex}
        />
        <SqlRotateAccountFields isUpdate={isUpdate} />
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
