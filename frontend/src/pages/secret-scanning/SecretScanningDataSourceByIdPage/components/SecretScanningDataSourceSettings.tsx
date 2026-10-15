import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteSecretScanningDataSourceModal } from "@app/components/secret-scanning/DeleteSecretScanningDataSourceModal";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
  Input,
  TextArea,
  Toggle
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import {
  doesDataSourceSupportDiscovery,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import { usePopUp } from "@app/hooks";
import {
  TSecretScanningDataSource,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";
import { slugSchema } from "@app/lib/schemas";

import { DataSourceConfigDisplay } from "./DataSourceConfigDisplay";

const GeneralFormSchema = z.object({
  name: slugSchema({ field: "Name" }),
  description: z.string().trim().max(256, "Cannot exceed 256 characters").nullish()
});

type TGeneralForm = z.infer<typeof GeneralFormSchema>;

type TScanToggleName = "isHistoricalScanEnabled" | "isScanNewCommitsEnabled" | "isDiscoveryEnabled";

type Props = {
  dataSource: TSecretScanningDataSource;
  onDeleted: () => void;
};

export const SecretScanningDataSourceSettings = ({ dataSource, onDeleted }: Props) => {
  const { permission } = useProjectPermission();
  const canEdit = permission.can(
    ProjectPermissionSecretScanningDataSourceActions.Edit,
    ProjectPermissionSub.SecretScanningDataSources
  );

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["deleteDataSource"] as const);

  const updateDataSource = useUpdateSecretScanningDataSource();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting }
  } = useForm<TGeneralForm>({
    resolver: zodResolver(GeneralFormSchema),
    // the Edit Configuration modal can also rename the data source, so follow the server values
    values: { name: dataSource.name, description: dataSource.description },
    resetOptions: { keepDirtyValues: true }
  });

  const { name: platform } = SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type];
  const { pluralNoun, pluralTitle } = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  const supportsDiscovery = doesDataSourceSupportDiscovery(dataSource);
  const connectionDetails =
    APP_CONNECTION_MAP[SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[dataSource.type]];

  const onSaveGeneral = async (form: TGeneralForm) => {
    await updateDataSource.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId,
      ...form
    });

    reset(form);
    createNotification({ text: "Data source updated", type: "success" });
  };

  const handleToggle = async (name: TScanToggleName, label: string, isEnabled: boolean) => {
    await updateDataSource.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId,
      [name]: isEnabled
    });

    createNotification({
      text: `${label} ${isEnabled ? "enabled" : "disabled"}`,
      type: "success"
    });
  };

  const scanToggles: {
    name: TScanToggleName;
    label: string;
    description: string;
    isDisabled?: boolean;
  }[] = [
    {
      name: "isScanNewCommitsEnabled",
      label: "Scan New Commits",
      description: `Trigger a diff scan on every new commit, across new and existing ${pluralNoun}.`
    },
    {
      name: "isHistoricalScanEnabled",
      label: "Historical Scan",
      description: `Scan newly added ${pluralNoun} for existing secrets as soon as they're enabled.`
    },
    {
      name: "isDiscoveryEnabled",
      label: `Discover New ${pluralTitle}`,
      isDisabled: !supportsDiscovery,
      description: supportsDiscovery
        ? `Automatically enable scanning for new ${pluralNoun} added to ${platform}.`
        : "GitLab only reports new projects through group webhooks, so discovery needs a group-scoped data source."
    }
  ];

  return (
    <>
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>How this data source appears across Secret Scanning.</CardDescription>
          </CardHeader>
          <CardContent>
            <form id="data-source-general-form" onSubmit={handleSubmit(onSaveGeneral)}>
              <FieldGroup>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Controller
                    control={control}
                    name="name"
                    render={({ field, fieldState: { error } }) => (
                      <Field data-invalid={Boolean(error)} data-disabled={!canEdit}>
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
                    <Field data-disabled>
                      <FieldLabel htmlFor="data-source-connection">
                        {connectionDetails.name} Connection
                      </FieldLabel>
                      <FieldContent>
                        <Combobox<{ id: string; name: string }>
                          id="data-source-connection"
                          value={dataSource.connection}
                          options={[dataSource.connection]}
                          isClearable={false}
                          isDisabled
                          onValueChange={() => {}}
                          getOptionLabel={(option) => option.name}
                          getOptionValue={(option) => option.id}
                          aria-describedby="data-source-connection-help"
                        />
                        <FieldDescription id="data-source-connection-help">
                          Cannot be updated
                        </FieldDescription>
                      </FieldContent>
                    </Field>
                  )}
                </div>
                <Controller
                  control={control}
                  name="description"
                  render={({ field, fieldState: { error } }) => (
                    <Field data-invalid={Boolean(error)} data-disabled={!canEdit}>
                      <FieldLabel htmlFor="data-source-description">
                        Description (Optional)
                      </FieldLabel>
                      <FieldContent>
                        <TextArea
                          {...field}
                          id="data-source-description"
                          value={field.value ?? ""}
                          placeholder="Describe what this data source scans..."
                          rows={3}
                          aria-invalid={Boolean(error)}
                          disabled={!canEdit}
                        />
                        <FieldError errors={[error]} />
                      </FieldContent>
                    </Field>
                  )}
                />
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="justify-end">
            <Button
              type="submit"
              form="data-source-general-form"
              variant="ss"
              isPending={isSubmitting}
              isDisabled={!canEdit || !isDirty || isSubmitting}
            >
              Save Changes
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scanning</CardTitle>
            <CardDescription>
              Choose which {pluralNoun} and commits are scanned for secrets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <DataSourceConfigDisplay dataSource={dataSource} />
              {scanToggles.map(({ name, label, description, isDisabled }) => (
                <Field key={name} orientation="horizontal" data-disabled={!canEdit || isDisabled}>
                  <FieldContent>
                    <FieldTitle id={`data-source-${name}-title`}>{label}</FieldTitle>
                    <FieldDescription id={`data-source-${name}-help`}>
                      {description}
                    </FieldDescription>
                  </FieldContent>
                  <Toggle
                    id={`data-source-${name}`}
                    variant="ss"
                    checked={dataSource[name] && !isDisabled}
                    onCheckedChange={(checked) => handleToggle(name, label, checked)}
                    disabled={!canEdit || isDisabled || updateDataSource.isPending}
                    aria-labelledby={`data-source-${name}-title`}
                    aria-describedby={`data-source-${name}-help`}
                  />
                </Field>
              ))}
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Danger Zone</CardTitle>
            <CardDescription>
              Stop scanning {dataSource.name} and permanently delete its findings and scan history.
            </CardDescription>
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionSecretScanningDataSourceActions.Delete}
                a={ProjectPermissionSub.SecretScanningDataSources}
              >
                {(isAllowed) => (
                  <Button
                    variant="danger"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("deleteDataSource")}
                  >
                    <TrashIcon />
                    Delete Data Source
                  </Button>
                )}
              </ProjectPermissionCan>
            </CardAction>
          </CardHeader>
        </Card>
      </div>
      <DeleteSecretScanningDataSourceModal
        dataSource={dataSource}
        isOpen={popUp.deleteDataSource.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteDataSource", isOpen)}
        onComplete={onDeleted}
      />
    </>
  );
};
