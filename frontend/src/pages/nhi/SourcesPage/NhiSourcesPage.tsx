import { useState } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, RefreshCwIcon, TrashIcon } from "lucide-react";
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
  SelectItem as V2SelectItem
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
  useListNhiSources,
  useTriggerNhiScan
} from "@app/hooks/api/nhi";
import { NhiProvider, NhiScanStatus } from "@app/hooks/api/nhi/types";
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
  [NhiProvider.GitHub]: "github"
};

const addSourceSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(255),
    provider: z.string().min(1, "Provider is required"),
    connectionId: z.string().uuid("Please select an app connection"),
    orgName: z.string().optional()
  })
  .refine(
    (data) => {
      if (data.provider === NhiProvider.GitHub) {
        return Boolean(data.orgName?.trim());
      }
      return true;
    },
    { message: "GitHub organization name is required", path: ["orgName"] }
  );

type TAddSourceForm = z.infer<typeof addSourceSchema>;

export const NhiSourcesPage = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();

  const { data: sources = [], isPending } = useListNhiSources(currentProject.id, {
    refetchInterval: 5000
  });

  const { data: allConnections = [] } = useListAppConnections();

  const createSource = useCreateNhiSource();
  const deleteSource = useDeleteNhiSource();
  const triggerScan = useTriggerNhiScan();

  const [sourceToDelete, setSourceToDelete] = useState<{ id: string; name: string } | null>(null);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addSource"] as const);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting }
  } = useForm<TAddSourceForm>({
    resolver: zodResolver(addSourceSchema),
    defaultValues: { name: "", provider: NhiProvider.AWS, connectionId: "", orgName: "" }
  });

  const selectedProvider = useWatch({ control, name: "provider" });
  const isGitHub = selectedProvider === NhiProvider.GitHub;

  const filteredConnections = allConnections.filter(
    (c) => c.app === PROVIDER_APP_MAP[selectedProvider]
  );

  const onAddSource = async (formData: TAddSourceForm) => {
    try {
      const payload: {
        projectId: string;
        name: string;
        provider: string;
        connectionId: string;
        config?: Record<string, unknown>;
      } = {
        projectId: currentProject.id,
        name: formData.name,
        provider: formData.provider,
        connectionId: formData.connectionId
      };

      if (formData.provider === NhiProvider.GitHub && formData.orgName) {
        payload.config = { orgName: formData.orgName.trim() };
      }

      await createSource.mutateAsync(payload);
      createNotification({ text: "Source added successfully", type: "success" });
      reset();
      handlePopUpToggle("addSource", false);
    } catch {
      createNotification({ text: "Failed to add source", type: "error" });
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
        <Button onClick={() => handlePopUpOpen("addSource")}>
          <PlusIcon size={14} className="mr-1" />
          Add Source
        </Button>
      </div>

      <UnstableTable containerClassName="mt-4">
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Name</UnstableTableHead>
            <UnstableTableHead>Provider</UnstableTableHead>
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
                    placeholder={isGitHub ? "e.g. My GitHub Org" : "e.g. Production AWS Account"}
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
                    }}
                    className="w-full"
                  >
                    <V2SelectItem value={NhiProvider.AWS}>AWS</V2SelectItem>
                    <V2SelectItem value={NhiProvider.GitHub}>GitHub</V2SelectItem>
                  </V2Select>
                </FormControl>
              )}
            />
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
