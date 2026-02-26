import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BellIcon, PencilIcon, PlusIcon, RefreshCwIcon, TrashIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button as V2Button,
  DeleteActionModal,
  FormControl,
  Input,
  Modal,
  ModalContent,
  PageHeader,
  Select as V2Select,
  SelectItem as V2SelectItem,
  Switch
} from "@app/components/v2";
import {
  Badge,
  Button,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useCreateNhiSource,
  useDeleteNhiSource,
  useGetNhiNotificationSettings,
  useListNhiSources,
  useTriggerNhiScan,
  useUpdateNhiNotificationSettings,
  useUpdateNhiSource
} from "@app/hooks/api/nhi";
import { NhiProvider, NhiScanSchedule, NhiScanStatus } from "@app/hooks/api/nhi/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

const ScanStatusBadge = ({ status }: { status: string | null }) => {
  if (!status) return <span className="text-mineshaft-400">-</span>;

  switch (status) {
    case NhiScanStatus.Scanning:
      return <Badge variant="info">Scanning...</Badge>;
    case NhiScanStatus.Completed:
      return <Badge variant="success">Completed</Badge>;
    case NhiScanStatus.Failed:
      return <Badge variant="danger">Failed</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};

const PROVIDER_APP_MAP: Record<string, string> = {
  [NhiProvider.AWS]: "aws",
  [NhiProvider.GitHub]: "github",
  [NhiProvider.GCP]: "gcp"
};

const MANUAL_SCHEDULE = "manual";

const SCHEDULE_LABELS: Record<string, string> = {
  [NhiScanSchedule.Every6Hours]: "Every 6 Hours",
  [NhiScanSchedule.Every12Hours]: "Every 12 Hours",
  [NhiScanSchedule.Daily]: "Daily",
  [NhiScanSchedule.Weekly]: "Weekly"
};

const addSourceSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(255),
    provider: z.string().min(1, "Provider is required"),
    connectionId: z.string().optional(),
    orgName: z.string().optional(),
    projectId: z.string().optional(),
    scanSchedule: z.string().optional()
  })
  .refine(
    (data) => {
      if (data.provider !== NhiProvider.GCP) {
        return Boolean(data.connectionId && data.connectionId.length > 0);
      }
      return true;
    },
    { message: "Please select an app connection", path: ["connectionId"] }
  )
  .refine(
    (data) => {
      if (data.provider === NhiProvider.GitHub) {
        return Boolean(data.orgName?.trim());
      }
      return true;
    },
    { message: "GitHub organization name is required", path: ["orgName"] }
  )
  .refine(
    (data) => {
      if (data.provider === NhiProvider.GCP) {
        return Boolean(data.projectId?.trim());
      }
      return true;
    },
    { message: "GCP project ID is required", path: ["projectId"] }
  );

type TAddSourceForm = z.infer<typeof addSourceSchema>;

const editSourceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  scanSchedule: z.string().optional()
});

type TEditSourceForm = z.infer<typeof editSourceSchema>;

export const NhiSourcesPage = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();

  const { data: sources = [], isPending } = useListNhiSources(currentProject.id, {
    refetchInterval: 5000
  });

  const { data: allConnections = [] } = useListAppConnections();
  const { data: notifSettings } = useGetNhiNotificationSettings(currentProject.id);

  const createSource = useCreateNhiSource();
  const deleteSource = useDeleteNhiSource();
  const triggerScan = useTriggerNhiScan();
  const updateSource = useUpdateNhiSource();
  const updateNotifSettings = useUpdateNhiNotificationSettings();

  const [sourceToDelete, setSourceToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingSource, setEditingSource] = useState<{
    id: string;
    name: string;
    scanSchedule: string | null;
  } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // Notification form state
  const [scanNotifEnabled, setScanNotifEnabled] = useState(false);
  const [scanChannels, setScanChannels] = useState("");
  const [policyNotifEnabled, setPolicyNotifEnabled] = useState(false);
  const [policyChannels, setPolicyChannels] = useState("");

  useEffect(() => {
    if (notifSettings) {
      setScanNotifEnabled(notifSettings.isNhiScanNotificationEnabled);
      setScanChannels(notifSettings.nhiScanChannels);
      setPolicyNotifEnabled(notifSettings.isNhiPolicyNotificationEnabled);
      setPolicyChannels(notifSettings.nhiPolicyChannels);
    }
  }, [notifSettings]);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addSource"] as const);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting }
  } = useForm<TAddSourceForm>({
    resolver: zodResolver(addSourceSchema),
    defaultValues: {
      name: "",
      provider: NhiProvider.AWS,
      connectionId: "",
      orgName: "",
      projectId: "",
      scanSchedule: MANUAL_SCHEDULE
    }
  });

  const {
    control: editControl,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
    formState: { isSubmitting: isEditSubmitting }
  } = useForm<TEditSourceForm>({
    resolver: zodResolver(editSourceSchema),
    defaultValues: { name: "", scanSchedule: "" }
  });

  useEffect(() => {
    if (editingSource) {
      resetEdit({
        name: editingSource.name,
        scanSchedule: editingSource.scanSchedule || MANUAL_SCHEDULE
      });
    }
  }, [editingSource, resetEdit]);

  const selectedProvider = useWatch({ control, name: "provider" });
  const isGitHub = selectedProvider === NhiProvider.GitHub;
  const isGcp = selectedProvider === NhiProvider.GCP;

  const filteredConnections = allConnections.filter(
    (c) => c.app === PROVIDER_APP_MAP[selectedProvider]
  );

  const onAddSource = async (formData: TAddSourceForm) => {
    try {
      const payload: {
        projectId: string;
        name: string;
        provider: string;
        connectionId?: string;
        config?: Record<string, unknown>;
        scanSchedule?: string | null;
      } = {
        projectId: currentProject.id,
        name: formData.name,
        provider: formData.provider
      };

      if (formData.provider !== NhiProvider.GCP && formData.connectionId) {
        payload.connectionId = formData.connectionId;
      }

      if (formData.provider === NhiProvider.GitHub && formData.orgName) {
        payload.config = { orgName: formData.orgName.trim() };
      }

      if (formData.provider === NhiProvider.GCP && formData.projectId) {
        payload.config = { projectId: formData.projectId.trim() };
      }

      if (formData.scanSchedule && formData.scanSchedule !== MANUAL_SCHEDULE) {
        payload.scanSchedule = formData.scanSchedule;
      }

      await createSource.mutateAsync(payload);
      createNotification({ text: "Source added successfully", type: "success" });
      reset();
      handlePopUpToggle("addSource", false);
    } catch {
      createNotification({ text: "Failed to add source", type: "error" });
    }
  };

  const onEditSource = async (formData: TEditSourceForm) => {
    if (!editingSource) return;
    try {
      await updateSource.mutateAsync({
        sourceId: editingSource.id,
        projectId: currentProject.id,
        name: formData.name,
        scanSchedule: formData.scanSchedule && formData.scanSchedule !== MANUAL_SCHEDULE ? formData.scanSchedule : null
      });
      createNotification({ text: "Source updated", type: "success" });
      setEditingSource(null);
    } catch {
      createNotification({ text: "Failed to update source", type: "error" });
    }
  };

  const onDeleteSource = async () => {
    if (!sourceToDelete) return;
    try {
      await deleteSource.mutateAsync({
        sourceId: sourceToDelete.id,
        projectId: currentProject.id
      });
      createNotification({ text: "Source deleted", type: "success" });
      setSourceToDelete(null);
    } catch {
      createNotification({ text: "Failed to delete source", type: "error" });
    }
  };

  const onTriggerScan = async (sourceId: string) => {
    try {
      await triggerScan.mutateAsync({ sourceId, projectId: currentProject.id });
      createNotification({ text: "Scan triggered", type: "success" });
    } catch {
      createNotification({ text: "Failed to trigger scan", type: "error" });
    }
  };

  const onSaveNotificationSettings = async () => {
    try {
      await updateNotifSettings.mutateAsync({
        projectId: currentProject.id,
        isNhiScanNotificationEnabled: scanNotifEnabled,
        nhiScanChannels: scanChannels,
        isNhiPolicyNotificationEnabled: policyNotifEnabled,
        nhiPolicyChannels: policyChannels
      });
      createNotification({ text: "Notification settings saved", type: "success" });
    } catch {
      createNotification({ text: "Failed to save notification settings", type: "error" });
    }
  };

  return (
    <>
      <Helmet>
        <title>Identity - Sources</title>
      </Helmet>
      <div className="flex items-center justify-between">
        <PageHeader
          scope={ProjectType.NHI}
          title="Sources"
          description="Connect cloud accounts to discover non-human identities."
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowNotifications(!showNotifications)}>
            <BellIcon size={14} className="mr-1" />
            Notifications
          </Button>
          <Button onClick={() => handlePopUpOpen("addSource")}>
            <PlusIcon size={14} className="mr-1" />
            Add Source
          </Button>
        </div>
      </div>

      {showNotifications && (
        <div className="mt-4 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
          <h3 className="mb-3 text-sm font-medium text-mineshaft-100">Slack Notifications</h3>
          {notifSettings && !notifSettings.isSlackConfigured ? (
            <p className="text-sm text-mineshaft-400">
              Slack integration is not configured for this project.{" "}
              <a
                href={`/organizations/${currentOrg.id}/settings`}
                className="text-primary hover:underline"
              >
                Configure Slack integration
              </a>{" "}
              in your organization settings first.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-mineshaft-100">Scan completion notifications</p>
                  <p className="text-xs text-mineshaft-400">
                    Get notified when NHI scans complete with a summary of findings.
                  </p>
                </div>
                <Switch isChecked={scanNotifEnabled} onCheckedChange={setScanNotifEnabled} />
              </div>
              {scanNotifEnabled && (
                <Input
                  value={scanChannels}
                  onChange={(e) => setScanChannels(e.target.value)}
                  placeholder="Slack channel IDs (comma-separated)"
                  className="text-sm"
                />
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-mineshaft-100">Policy remediation notifications</p>
                  <p className="text-xs text-mineshaft-400">
                    Get notified when policies auto-remediate identities.
                  </p>
                </div>
                <Switch isChecked={policyNotifEnabled} onCheckedChange={setPolicyNotifEnabled} />
              </div>
              {policyNotifEnabled && (
                <Input
                  value={policyChannels}
                  onChange={(e) => setPolicyChannels(e.target.value)}
                  placeholder="Slack channel IDs (comma-separated)"
                  className="text-sm"
                />
              )}

              <div className="flex justify-end">
                <V2Button
                  onClick={onSaveNotificationSettings}
                  isLoading={updateNotifSettings.isPending}
                  size="xs"
                >
                  Save Notification Settings
                </V2Button>
              </div>
            </div>
          )}
        </div>
      )}

      <UnstableTable containerClassName="mt-4">
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Name</UnstableTableHead>
            <UnstableTableHead>Provider</UnstableTableHead>
            <UnstableTableHead>Schedule</UnstableTableHead>
            <UnstableTableHead>Status</UnstableTableHead>
            <UnstableTableHead>Identities Found</UnstableTableHead>
            <UnstableTableHead>Last Scanned</UnstableTableHead>
            <UnstableTableHead>Actions</UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {!isPending &&
            sources.map((source) => (
              <UnstableTableRow key={source.id}>
                <UnstableTableCell className="font-medium text-mineshaft-100">
                  {source.name}
                </UnstableTableCell>
                <UnstableTableCell>
                  <Badge variant="neutral" className="uppercase">
                    {source.provider}
                  </Badge>
                </UnstableTableCell>
                <UnstableTableCell>
                  {source.scanSchedule ? (
                    <Badge variant="info">
                      {SCHEDULE_LABELS[source.scanSchedule] || source.scanSchedule}
                    </Badge>
                  ) : (
                    <span className="text-mineshaft-400">Manual</span>
                  )}
                </UnstableTableCell>
                <UnstableTableCell>
                  <ScanStatusBadge status={source.lastScanStatus} />
                </UnstableTableCell>
                <UnstableTableCell>{source.lastIdentitiesFound ?? "-"}</UnstableTableCell>
                <UnstableTableCell>
                  {source.lastScannedAt ? new Date(source.lastScannedAt).toLocaleString() : "Never"}
                </UnstableTableCell>
                <UnstableTableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      isDisabled={source.lastScanStatus === NhiScanStatus.Scanning}
                      isPending={source.lastScanStatus === NhiScanStatus.Scanning}
                      onClick={() => onTriggerScan(source.id)}
                    >
                      <RefreshCwIcon size={12} className="mr-1" />
                      Scan Now
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        setEditingSource({
                          id: source.id,
                          name: source.name,
                          scanSchedule: source.scanSchedule
                        })
                      }
                    >
                      <PencilIcon size={12} className="mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="danger"
                      onClick={() => setSourceToDelete({ id: source.id, name: source.name })}
                    >
                      <TrashIcon size={12} className="mr-1" />
                      Delete
                    </Button>
                  </div>
                </UnstableTableCell>
              </UnstableTableRow>
            ))}
        </UnstableTableBody>
      </UnstableTable>
      {!isPending && sources.length === 0 && (
        <UnstableEmpty>
          <UnstableEmptyHeader>
            <UnstableEmptyTitle>No sources configured</UnstableEmptyTitle>
            <UnstableEmptyDescription>
              Add a cloud source to start discovering non-human identities.
            </UnstableEmptyDescription>
          </UnstableEmptyHeader>
        </UnstableEmpty>
      )}

      {/* Add Source Modal */}
      <Modal
        isOpen={popUp.addSource.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addSource", isOpen)}
      >
        <ModalContent title="Add Cloud Source">
          <form onSubmit={handleSubmit(onAddSource)}>
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
                  <Input
                    {...field}
                    placeholder={
                      // eslint-disable-next-line no-nested-ternary
                      isGitHub
                        ? "e.g. My GitHub Org"
                        : isGcp
                          ? "e.g. My GCP Project"
                          : "e.g. Production AWS Account"
                    }
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="provider"
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl label="Provider" isError={Boolean(error)} errorText={error?.message}>
                  <V2Select
                    value={value}
                    onValueChange={(val) => {
                      onChange(val);
                      setValue("connectionId", "");
                      setValue("orgName", "");
                      setValue("projectId", "");
                    }}
                    className="w-full"
                  >
                    <V2SelectItem value={NhiProvider.AWS}>AWS</V2SelectItem>
                    <V2SelectItem value={NhiProvider.GitHub}>GitHub</V2SelectItem>
                    <V2SelectItem value={NhiProvider.GCP}>GCP</V2SelectItem>
                  </V2Select>
                </FormControl>
              )}
            />
            {!isGcp && (
              <Controller
                control={control}
                name="connectionId"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="App Connection"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <div>
                      <V2Select
                        value={value}
                        onValueChange={onChange}
                        className="w-full"
                        placeholder={
                          isGitHub
                            ? "Select a GitHub app connection..."
                            : "Select an AWS app connection..."
                        }
                      >
                        {filteredConnections.map((conn) => (
                          <V2SelectItem key={conn.id} value={conn.id}>
                            {conn.name}
                          </V2SelectItem>
                        ))}
                      </V2Select>
                      {filteredConnections.length === 0 && (
                        <p className="mt-1 text-xs text-mineshaft-400">
                          No {isGitHub ? "GitHub" : "AWS"} app connections found.{" "}
                          <a
                            href={`/organizations/${currentOrg.id}/app-connections`}
                            className="text-primary hover:underline"
                          >
                            Create one first
                          </a>
                          .
                        </p>
                      )}
                    </div>
                  </FormControl>
                )}
              />
            )}
            {isGcp && (
              <Controller
                control={control}
                name="projectId"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="GCP Project ID"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="e.g. infisical-prod-392817" />
                  </FormControl>
                )}
              />
            )}
            {isGitHub && (
              <Controller
                control={control}
                name="orgName"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="GitHub Organization"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="e.g. my-github-org" />
                  </FormControl>
                )}
              />
            )}
            <Controller
              control={control}
              name="scanSchedule"
              render={({ field: { value, onChange } }) => (
                <FormControl label="Scan Schedule">
                  <V2Select
                    value={value || MANUAL_SCHEDULE}
                    onValueChange={onChange}
                    className="w-full"
                    placeholder="Manual (no schedule)"
                  >
                    <V2SelectItem value={MANUAL_SCHEDULE}>Manual</V2SelectItem>
                    <V2SelectItem value={NhiScanSchedule.Every6Hours}>Every 6 Hours</V2SelectItem>
                    <V2SelectItem value={NhiScanSchedule.Every12Hours}>Every 12 Hours</V2SelectItem>
                    <V2SelectItem value={NhiScanSchedule.Daily}>Daily</V2SelectItem>
                    <V2SelectItem value={NhiScanSchedule.Weekly}>Weekly</V2SelectItem>
                  </V2Select>
                </FormControl>
              )}
            />
            <div className="mt-4 flex justify-end gap-2">
              <V2Button
                variant="outline_bg"
                onClick={() => handlePopUpToggle("addSource", false)}
                type="button"
              >
                Cancel
              </V2Button>
              <V2Button type="submit" isLoading={isSubmitting}>
                Add Source
              </V2Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      {/* Edit Source Modal */}
      <Modal
        isOpen={Boolean(editingSource)}
        onOpenChange={(isOpen) => !isOpen && setEditingSource(null)}
      >
        <ModalContent title={`Edit Source: ${editingSource?.name ?? ""}`}>
          <form onSubmit={handleEditSubmit(onEditSource)}>
            <Controller
              control={editControl}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} />
                </FormControl>
              )}
            />
            <Controller
              control={editControl}
              name="scanSchedule"
              render={({ field: { value, onChange } }) => (
                <FormControl label="Scan Schedule">
                  <V2Select
                    value={value || MANUAL_SCHEDULE}
                    onValueChange={onChange}
                    className="w-full"
                    placeholder="Manual (no schedule)"
                  >
                    <V2SelectItem value={MANUAL_SCHEDULE}>Manual</V2SelectItem>
                    <V2SelectItem value={NhiScanSchedule.Every6Hours}>Every 6 Hours</V2SelectItem>
                    <V2SelectItem value={NhiScanSchedule.Every12Hours}>Every 12 Hours</V2SelectItem>
                    <V2SelectItem value={NhiScanSchedule.Daily}>Daily</V2SelectItem>
                    <V2SelectItem value={NhiScanSchedule.Weekly}>Weekly</V2SelectItem>
                  </V2Select>
                </FormControl>
              )}
            />
            <div className="mt-4 flex justify-end gap-2">
              <V2Button variant="outline_bg" onClick={() => setEditingSource(null)} type="button">
                Cancel
              </V2Button>
              <V2Button type="submit" isLoading={isEditSubmitting}>
                Save Changes
              </V2Button>
            </div>
          </form>
        </ModalContent>
      </Modal>

      <DeleteActionModal
        isOpen={Boolean(sourceToDelete)}
        title={`Delete source "${sourceToDelete?.name}"?`}
        subTitle="This will remove the source and all discovered identities associated with it."
        onChange={(isOpen) => !isOpen && setSourceToDelete(null)}
        deleteKey={sourceToDelete?.name ?? ""}
        onDeleteApproved={onDeleteSource}
      />
    </>
  );
};
