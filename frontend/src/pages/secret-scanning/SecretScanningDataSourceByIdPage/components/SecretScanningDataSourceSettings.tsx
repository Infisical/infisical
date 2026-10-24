import { TrashIcon } from "lucide-react";

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
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import {
  CLAUDE_CODE_SECRET_DETECTED_ACTION_MAP,
  doesDataSourceRequireConnection,
  doesDataSourceSupportDiscovery,
  getClaudeCodeSecretDetectedAction,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import { usePopUp } from "@app/hooks";
import {
  SecretScanningDataSource,
  TSecretScanningDataSource,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";
import { ClaudeCodeSecretDetectedAction } from "@app/hooks/api/secretScanningV2/types/claude-code-data-source";

import { ClaudeCodeDataSourceSetup } from "./ClaudeCodeDataSourceSetup";
import { DataSourceConfigDisplay } from "./DataSourceConfigDisplay";
import { DataSourceDetailsCard } from "./DataSourceDetailsCard";

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

  const { name: platform } = SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type];
  const { pluralNoun, pluralTitle } = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  const supportsDiscovery = doesDataSourceSupportDiscovery(dataSource);

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

  const handleSecretDetectedActionChange = async (
    onSecretDetected: ClaudeCodeSecretDetectedAction
  ) => {
    await updateDataSource.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId,
      config: { onSecretDetected }
    });

    createNotification({
      text: `Detected secrets set to "${CLAUDE_CODE_SECRET_DETECTED_ACTION_MAP[onSecretDetected].name}"`,
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
        <DataSourceDetailsCard dataSource={dataSource} canEdit={canEdit} />

        {dataSource.type === SecretScanningDataSource.ClaudeCode && (
          <Card>
            <CardHeader>
              <CardTitle>Scanning</CardTitle>
              <CardDescription>
                Choose what happens when the plugin finds a secret in a prompt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Field orientation="horizontal" data-disabled={!canEdit}>
                <FieldContent>
                  <FieldTitle id="data-source-on-secret-detected-title">
                    When a Secret Is Detected
                  </FieldTitle>
                  <FieldDescription id="data-source-on-secret-detected-help">
                    {
                      CLAUDE_CODE_SECRET_DETECTED_ACTION_MAP[
                        getClaudeCodeSecretDetectedAction(dataSource.config)
                      ].description
                    }
                  </FieldDescription>
                </FieldContent>
                <Select
                  value={getClaudeCodeSecretDetectedAction(dataSource.config)}
                  onValueChange={(value) =>
                    handleSecretDetectedActionChange(value as ClaudeCodeSecretDetectedAction)
                  }
                  disabled={!canEdit || updateDataSource.isPending}
                >
                  <SelectTrigger
                    id="data-source-on-secret-detected"
                    className="w-48 shrink-0"
                    aria-labelledby="data-source-on-secret-detected-title"
                    aria-describedby="data-source-on-secret-detected-help"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="end" className="w-80">
                    {Object.values(ClaudeCodeSecretDetectedAction).map((action) => (
                      <SelectItem
                        key={action}
                        value={action}
                        description={CLAUDE_CODE_SECRET_DETECTED_ACTION_MAP[action].description}
                      >
                        {CLAUDE_CODE_SECRET_DETECTED_ACTION_MAP[action].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>
        )}

        {/* Claude Code prompts are scanned as the plugin submits them, so there are no scan toggles */}
        {dataSource.type === SecretScanningDataSource.ClaudeCode && (
          <Card>
            <CardHeader>
              <CardTitle>
                Plugin Setup
                <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/claude-code" />
              </CardTitle>
              <CardDescription>
                Connect Claude Code to this data source to scan prompts for secrets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClaudeCodeDataSourceSetup dataSourceName={dataSource.name} />
            </CardContent>
          </Card>
        )}

        {doesDataSourceRequireConnection(dataSource.type) && (
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
        )}

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
