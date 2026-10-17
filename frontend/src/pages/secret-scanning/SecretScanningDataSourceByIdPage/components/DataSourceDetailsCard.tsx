import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlugIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  TextArea
} from "@app/components/v3";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP } from "@app/helpers/secretScanningV2";
import {
  TSecretScanningDataSource,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";
import { slugSchema } from "@app/lib/schemas";

const DetailsFormSchema = z.object({
  name: slugSchema({ field: "Name" }),
  description: z.string().trim().max(256, "Cannot exceed 256 characters").nullish()
});

type TDetailsForm = z.infer<typeof DetailsFormSchema>;

type Props = {
  dataSource: TSecretScanningDataSource;
  canEdit: boolean;
};

export const DataSourceDetailsCard = ({ dataSource, canEdit }: Props) => {
  const updateDataSource = useUpdateSecretScanningDataSource();

  const connectionDetails =
    APP_CONNECTION_MAP[SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[dataSource.type]];

  const {
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting }
  } = useForm<TDetailsForm>({
    resolver: zodResolver(DetailsFormSchema),
    values: { name: dataSource.name, description: dataSource.description }
  });

  const onSubmit = async (form: TDetailsForm) => {
    await updateDataSource.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId,
      ...form
    });

    createNotification({ text: `Data source "${form.name}" updated`, type: "success" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
        <CardDescription>How this data source appears across Secret Scanning.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="data-source-name">Name</FieldLabel>
                  <FieldContent>
                    <Input
                      {...field}
                      id="data-source-name"
                      autoComplete="off"
                      isError={Boolean(error)}
                      disabled={!canEdit}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
            {dataSource.connection && (
              <Field>
                <FieldLabel htmlFor="data-source-connection">App Connection</FieldLabel>
                <FieldContent>
                  <InputGroup data-disabled="true">
                    <InputGroupAddon>
                      <PlugIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="data-source-connection"
                      value={dataSource.connection.name}
                      disabled
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText className="text-xs">{connectionDetails.name}</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </FieldContent>
              </Field>
            )}
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)} className="col-span-full">
                  <FieldLabel htmlFor="data-source-description">Description</FieldLabel>
                  <FieldContent>
                    <TextArea
                      {...field}
                      id="data-source-description"
                      value={field.value ?? ""}
                      placeholder="No description"
                      rows={2}
                      aria-invalid={Boolean(error)}
                      disabled={!canEdit}
                    />
                    <FieldError errors={[error]} />
                  </FieldContent>
                </Field>
              )}
            />
          </div>
        </CardContent>
        {canEdit && (
          <CardFooter className="justify-end">
            <Button
              type="submit"
              variant="ss"
              isPending={isSubmitting}
              isDisabled={!isDirty || isSubmitting}
            >
              Save Changes
            </Button>
          </CardFooter>
        )}
      </form>
    </Card>
  );
};
