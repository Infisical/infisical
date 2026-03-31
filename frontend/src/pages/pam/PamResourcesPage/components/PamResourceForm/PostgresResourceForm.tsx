import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, SheetFooter } from "@app/components/v3";
import { PamResourceType, TPostgresResource } from "@app/hooks/api/pam";

import { BaseSqlResourceSchema } from "./shared/sql-resource-schemas";
import { SqlResourceFields } from "./shared/SqlResourceFields";
import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";
import { MetadataFields } from "./MetadataFields";

type Props = {
  resource?: TPostgresResource;
  onSubmit: (formData: FormData) => Promise<void>;
  closeSheet: () => void;
};

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.Postgres),
  connectionDetails: BaseSqlResourceSchema
});

type FormData = z.infer<typeof formSchema>;

export const PostgresResourceForm = ({ resource, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(resource);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource
      ? {
          ...resource,
          gateway: resource.gatewayId ? { id: resource.gatewayId, name: "" } : undefined
        }
      : {
          resourceType: PamResourceType.Postgres,
          gateway: undefined,
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
        onSubmit={handleSubmit((data) => onSubmit(data as FormData))}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex min-h-0 flex-1 shrink flex-col gap-4 overflow-y-auto p-4 pb-8">
          <GenericResourceFields />
          <SqlResourceFields />
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
