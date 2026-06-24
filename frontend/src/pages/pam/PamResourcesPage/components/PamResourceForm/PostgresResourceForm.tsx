import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  Label,
  SheetFooter,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
  connectionDetails: BaseSqlResourceSchema.extend({
    branch: z
      .string()
      .trim()
      .max(255)
      .transform((value) => value || undefined)
      .optional()
  })
});

type FormData = z.infer<typeof formSchema>;

export const PostgresResourceForm = ({ resource, onSubmit, closeSheet }: Props) => {
  const isUpdate = Boolean(resource);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource
      ? {
          ...resource,
          gatewayId: resource.gatewayId ?? null,
          gatewayPoolId: resource.gatewayPoolId ?? null
        }
      : {
          resourceType: PamResourceType.Postgres,
          gatewayId: null,
          gatewayPoolId: null,
          connectionDetails: {
            host: "",
            port: 5432,
            database: "default",
            sslEnabled: true,
            sslRejectUnauthorized: true,
            sslCertificate: undefined,
            branch: undefined
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
          <SqlResourceFields />
          <div className="flex flex-col gap-3">
            <Label>Provider Routing</Label>
            <Controller
              name="connectionDetails.branch"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>
                    Branch
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="mb-0.5 ml-1 inline-block size-3 text-accent" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Required for branch-aware Postgres providers (e.g. PlanetScale). When set,
                        Infisical appends `.&lt;branch&gt;` to the connection username so the
                        provider&apos;s proxy routes to the correct branch. Leave empty for standard
                        PostgreSQL deployments.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="main (leave empty unless required)"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          </div>
          <MetadataFields />
        </div>
        <SheetFooter className="shrink-0 border-t">
          <Button
            isPending={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
            variant="neutral"
            type="submit"
          >
            {isUpdate ? "Update Details" : "Create Resource"}
          </Button>
          <Button onClick={closeSheet} variant="outline" className="mr-auto" type="button">
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
