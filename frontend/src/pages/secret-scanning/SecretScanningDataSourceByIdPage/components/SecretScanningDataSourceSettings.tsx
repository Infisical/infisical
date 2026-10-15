import { PencilIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteSecretScanningDataSourceModal } from "@app/components/secret-scanning/DeleteSecretScanningDataSourceModal";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailLabel,
  DetailValue,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
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

import { DataSourceConfigDisplay } from "./DataSourceConfigDisplay";
import { EditDataSourceDetailsDialog } from "./EditDataSourceDetailsDialog";

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

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "deleteDataSource",
    "editDetails"
  ] as const);

  const updateDataSource = useUpdateSecretScanningDataSource();

  const { name: platform } = SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type];
  const { pluralNoun, pluralTitle } = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  const supportsDiscovery = doesDataSourceSupportDiscovery(dataSource);
  const connectionDetails =
    APP_CONNECTION_MAP[SECRET_SCANNING_DATA_SOURCE_CONNECTION_MAP[dataSource.type]];

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
            <CardAction>
              <Button
                variant="outline"
                isDisabled={!canEdit}
                onClick={() => handlePopUpOpen("editDetails")}
              >
                <PencilIcon />
                Edit
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Detail>
                <DetailLabel>Name</DetailLabel>
                <DetailValue>{dataSource.name}</DetailValue>
              </Detail>
              {dataSource.connection && (
                <Detail>
                  <DetailLabel>{connectionDetails.name} Connection</DetailLabel>
                  <DetailValue>{dataSource.connection.name}</DetailValue>
                </Detail>
              )}
              <Detail className="md:col-span-2">
                <DetailLabel>Description</DetailLabel>
                <DetailValue>
                  {dataSource.description ? (
                    <p className="whitespace-pre-wrap">{dataSource.description}</p>
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                </DetailValue>
              </Detail>
            </div>
          </CardContent>
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
      <EditDataSourceDetailsDialog
        dataSource={dataSource}
        isOpen={popUp.editDetails.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editDetails", isOpen)}
      />
      <DeleteSecretScanningDataSourceModal
        dataSource={dataSource}
        isOpen={popUp.deleteDataSource.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteDataSource", isOpen)}
        onComplete={onDeleted}
      />
    </>
  );
};
