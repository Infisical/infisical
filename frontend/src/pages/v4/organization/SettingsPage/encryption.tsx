import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { List, ListRow } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { CopyButton } from "@infisical/cipher/ui/sensitive-editor";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetSections,
  SheetTitle
} from "@infisical/cipher/ui/sheet";

import { ExternalKmsUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { ExternalKmsProvider, type KmsListEntry } from "@app/hooks/api/kms/types";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { useOrgId, useOrgPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { AccessRestricted, Gate, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license";
import { AwsKmsForm, GcpKmsForm, type KmsFormHandle, type KmsFormMode } from "./kms-forms";
import { KMS_PROVIDERS } from "./kms-providers";

type SheetState =
  | { mode: "create" }
  | { mode: Exclude<KmsFormMode, "create">; entry: KmsListEntry };

const providerOf = (entry: KmsListEntry) => entry.externalKms.provider as ExternalKmsProvider;

const EditForm = ({
  state,
  formRef,
  ...props
}: {
  state: Extract<SheetState, { entry: KmsListEntry }>;
  formRef: React.Ref<KmsFormHandle>;
  onCancel: () => void;
  onDone: () => void;
  onPendingChange: (pending: boolean) => void;
}) => {
  const provider = providerOf(state.entry);
  const { data: kms, isPending } = useV4Adapter("orgSettings").useExternalKms({
    kmsId: state.entry.id,
    provider
  });
  if (isPending || !kms)
    return (
      <SheetSections
        header={
          <SheetHeader>
            <SheetTitle>{KMS_PROVIDERS[provider].title}</SheetTitle>
          </SheetHeader>
        }
      >
        <SheetBody>
          <Loader label="Loading KMS" />
        </SheetBody>
      </SheetSections>
    );
  const Form = provider === ExternalKmsProvider.Aws ? AwsKmsForm : GcpKmsForm;
  return <Form ref={formRef} kms={kms} mode={state.mode} {...props} />;
};

const KmsSheet = ({ state, onClose }: { state?: SheetState; onClose: () => void }) => {
  const [picked, setPicked] = useState<ExternalKmsProvider>();
  const form = useRef<KmsFormHandle>(null);
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState<"close" | "back">();

  const leave = (to: "close" | "back") => {
    setDiscard(undefined);
    if (to === "back") setPicked(undefined);
    else {
      setPicked(undefined);
      onClose();
    }
  };
  const request = (to: "close" | "back") => (form.current?.dirty ? setDiscard(to) : leave(to));
  const formProps = {
    onCancel: () => request("close"),
    onDone: () => leave("close"),
    onPendingChange: setPending
  };

  let body: React.ReactNode;
  if (state && state.mode !== "create")
    body = <EditForm state={state} formRef={form} {...formProps} />;
  else if (picked === ExternalKmsProvider.Aws)
    body = <AwsKmsForm ref={form} mode="create" onBack={() => request("back")} {...formProps} />;
  else if (picked === ExternalKmsProvider.Gcp)
    body = <GcpKmsForm ref={form} mode="create" onBack={() => request("back")} {...formProps} />;
  else
    body = (
      <SheetSections
        header={
          <SheetHeader>
            <SheetTitle>Add external KMS</SheetTitle>
          </SheetHeader>
        }
      >
        <SheetBody>
          <List label="KMS providers" size="sm">
            {Object.values(ExternalKmsProvider).map((provider) => (
              <ListRow
                key={provider}
                value={provider}
                label={KMS_PROVIDERS[provider].title}
                title={KMS_PROVIDERS[provider].title}
                media={<ProviderIcon icon={KMS_PROVIDERS[provider].icon} alt="" />}
                onClick={() => setPicked(provider)}
              />
            ))}
          </List>
        </SheetBody>
      </SheetSections>
    );

  return (
    <>
      <Sheet open={Boolean(state)} onOpenChange={(open) => !open && request("close")}>
        <SheetContent size="md" pending={pending}>
          {body}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        open={Boolean(discard)}
        onOpenChange={(open) => !open && setDiscard(undefined)}
        onDiscard={() => discard && leave(discard)}
        description="Your changes to this KMS will be lost."
      />
    </>
  );
};

export const EncryptionTab = () => {
  const orgId = useOrgId();
  const { permission, isPending: permissionPending } = useOrgPermission();
  const adapter = useV4Adapter("orgSettings");
  const { data: entitlements } = adapter.useEntitlements(orgId);
  const { data: list = [], isPending } = adapter.useExternalKmsList(orgId);
  const remove = adapter.useRemoveExternalKms();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const [sheet, setSheet] = useState<SheetState>();
  const [removing, setRemoving] = useState<KmsListEntry>();
  const [removePending, setRemovePending] = useState(false);

  const canRead = permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);
  const canCreate = permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.Kms);
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Kms);
  const canDelete = permission.can(OrgPermissionActions.Delete, OrgPermissionSubjects.Kms);

  const entitled = (run: () => void) => {
    if (entitlements && !entitlements.externalKms) {
      openUpgradeGate({
        paywallKey: "organization.org-encryption",
        intent: { ...ExternalKmsUpgradeIntent, isEnterpriseFeature: true }
      });
      return;
    }
    run();
  };

  const columns: DataTableColumn<KmsListEntry>[] = [
    {
      id: "provider",
      header: "Provider",
      width: 160,
      render: (row) => (
        <Inline gap={8} align="center" wrap={false}>
          <ProviderIcon icon={KMS_PROVIDERS[providerOf(row)].icon} alt="" size="sm" />
          {KMS_PROVIDERS[providerOf(row)]?.label ?? row.externalKms.provider.toUpperCase()}
        </Inline>
      )
    },
    {
      id: "alias",
      header: "Alias",
      primary: true,
      grow: true,
      text: (row) => row.name,
      render: (row) => (
        <Inline gap={4} align="center" wrap={false}>
          <MiddleTruncate text={row.name} />
          <CopyButton value={row.name} label={`Copy KMS alias ${row.name}`} size="sm" iconOnly />
        </Inline>
      )
    },
    {
      id: "id",
      header: "ID",
      width: 340,
      mono: true,
      text: (row) => row.id,
      render: (row) => (
        <Inline gap={4} align="center" wrap={false}>
          <MiddleTruncate text={row.id} />
          <CopyButton value={row.id} label={`Copy KMS ID ${row.id}`} size="sm" iconOnly />
        </Inline>
      )
    }
  ];

  const hasRows = isPending || list.length > 0;

  return (
    <Stack gap={24}>
      <PageHeader title="Encryption" />
      {!permissionPending && !canRead && <AccessRestricted requirement="Read KMS" />}
      {canRead && (
        <Card
          variant="framed"
          title="Key management systems"
          flush={hasRows}
          action={
            <Gate allowed={canCreate}>
              <Button
                variant="accent"
                icon="plus"
                disabled={!canCreate}
                onClick={() => entitled(() => setSheet({ mode: "create" }))}
              >
                Add KMS
              </Button>
            </Gate>
          }
        >
          {hasRows ? (
            <DataTable
              label="External KMS"
              rows={list}
              columns={columns}
              loading={isPending}
              getRowId={(row) => row.id}
              rowLabel={(row) => row.name}
              rowActions={{
                renderMenu: (row) => (
                  <>
                    <DropdownMenuItem
                      disabled={!canEdit}
                      description={canEdit ? undefined : RESTRICTED}
                      onSelect={() => entitled(() => setSheet({ mode: "details", entry: row }))}
                    >
                      <Icon name="pencil" />
                      Edit details
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!canEdit}
                      description={canEdit ? undefined : RESTRICTED}
                      onSelect={() => entitled(() => setSheet({ mode: "credentials", entry: row }))}
                    >
                      <Icon name="key" />
                      Edit credentials
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={!canDelete}
                      description={canDelete ? undefined : RESTRICTED}
                      onSelect={() => setRemoving(row)}
                    >
                      <Icon name="trash" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )
              }}
            />
          ) : (
            <EmptyState size="sm" icon="key" title="No external KMS configured" />
          )}
        </Card>
      )}
      <KmsSheet state={sheet} onClose={() => setSheet(undefined)} />
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" confirmText={removing?.name} pending={removePending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the external KMS configuration from your organization. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!removing) return;
                setRemovePending(true);
                try {
                  await remove.mutateAsync({ kmsId: removing.id, provider: providerOf(removing) });
                  saved(`External KMS "${removing.name}" deleted`);
                  setRemoving(undefined);
                } catch (error) {
                  failed("Failed to delete external KMS", error);
                } finally {
                  setRemovePending(false);
                }
              }}
            >
              Delete KMS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {upgradeGate}
    </Stack>
  );
};
