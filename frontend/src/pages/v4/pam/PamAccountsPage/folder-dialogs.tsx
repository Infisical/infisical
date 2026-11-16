import { type ReactNode, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { SettingsCard, useAutosave } from "@infisical/cipher/ui/settings-card";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetView,
  SheetViews
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { Text } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { format } from "date-fns";

import { type TAlert } from "@app/hooks/api/alerts/types";
import { PamResourcePermissionActions, type TPamFolderWithCount } from "@app/hooks/api/pam";
import { PamSheetTab, usePamSheetState } from "@app/hooks/usePamSheetState";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { ConfirmAction } from "./confirm-action";
import { FolderAlertView } from "./folder-alerts";
import { FolderApprovals } from "./folder-approvals";
import { MembersPanel } from "./members";
import { FOLDER_TABS } from "./sheet-tabs";

const NAME_MAX = 64;
const DESCRIPTION_MAX = 256;

const nameError = (name: string) => {
  if (!name.trim()) return "Required";
  if (name.length > NAME_MAX) return `Must be ${NAME_MAX} characters or fewer`;
  return undefined;
};

export const CreateFolderDialog = ({
  open,
  onOpenChange,
  onCreated
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (folder: { id: string; name: string }) => void;
}) => {
  const create = useV4Adapter("pam").useCreateFolder();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [pending, setPending] = useState(false);

  const close = () => {
    setName("");
    setDescription("");
    setErrors({});
    onOpenChange(false);
  };
  const guard = useDiscardChangesGuard({
    isDirty: Boolean(name.trim() || description.trim()),
    onDiscard: close
  });

  const submit = async () => {
    const next = {
      name: nameError(name),
      description:
        description.length > DESCRIPTION_MAX
          ? `Must be ${DESCRIPTION_MAX} characters or fewer`
          : undefined
    };
    setErrors(next);
    if (next.name || next.description) return;
    setPending(true);
    try {
      const folder = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined
      });
      saved("Folder created");
      onCreated?.(folder);
      close();
    } catch (error) {
      failed("Failed to create folder", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else guard.requestDiscard();
        }}
      >
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Add folder</DialogTitle>
          </DialogHeader>
          <form
            id="pam-create-folder"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <Field label="Name" error={errors.name}>
                <Input
                  autoComplete="off"
                  placeholder="backend-team"
                  value={name}
                  invalid={Boolean(errors.name)}
                  onChange={(event) => {
                    setName(event.target.value);
                    setErrors((current) => ({ ...current, name: undefined }));
                  }}
                />
              </Field>
              <Field label="Description" optional error={errors.description}>
                <Textarea
                  rows={3}
                  placeholder="Who needs access and what accounts will this contain?"
                  value={description}
                  aria-invalid={Boolean(errors.description) || undefined}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    setErrors((current) => ({ ...current, description: undefined }));
                  }}
                />
              </Field>
            </Stack>
          </form>
          <DialogFooter>
            <Inline gap={8} justify="end">
              <Button variant="outline" onClick={guard.requestDiscard}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="pam-create-folder" loading={pending}>
                Add folder
              </Button>
            </Inline>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="The folder you started will be lost."
      />
    </>
  );
};

export type FolderTarget = Pick<TPamFolderWithCount, "id" | "name" | "accountCount">;

export const DeleteFolderDialog = ({
  folder,
  onOpenChange,
  onDeleted
}: {
  folder: FolderTarget | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) => {
  const remove = useV4Adapter("pam").useDeleteFolder();
  const count = folder?.accountCount ?? 0;
  if (count > 0)
    return (
      <AlertDialog open={Boolean(folder)} onOpenChange={onOpenChange}>
        <AlertDialogContent tone="neutral">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${folder?.name ?? ""}`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`This folder contains ${count} account${count === 1 ? "" : "s"}. Move or delete ${count === 1 ? "it" : "them"} before this folder can be deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  return (
    <ConfirmAction
      open={Boolean(folder)}
      onOpenChange={onOpenChange}
      title={`Delete ${folder?.name ?? ""}`}
      description="This permanently deletes the folder. This cannot be undone."
      confirmText={folder?.name}
      action="Delete folder"
      onConfirm={async () => {
        if (!folder) return false;
        try {
          await remove.mutateAsync({ folderId: folder.id });
          saved("Folder deleted");
          onDeleted?.();
          return true;
        } catch (error) {
          failed("Failed to delete folder", error);
          return false;
        }
      }}
    />
  );
};

export const JoinFolderDialog = ({
  folder,
  onOpenChange
}: {
  folder: Pick<TPamFolderWithCount, "id" | "name"> | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const join = useV4Adapter("pam").useGrantFolderAdminAccess();
  return (
    <ConfirmAction
      open={Boolean(folder)}
      onOpenChange={onOpenChange}
      tone="neutral"
      title="Join folder as admin"
      description={`You'll become an admin of ${folder?.name ?? ""}, with full access to its accounts and members. Any role you already hold on this folder is replaced. The folder's existing admins are notified, and this is recorded in the audit log.`}
      action="Join as admin"
      onConfirm={async () => {
        if (!folder) return false;
        try {
          await join.mutateAsync({ folderId: folder.id });
          saved(`You're now an admin of ${folder.name}`);
          return true;
        } catch (error) {
          failed("Failed to join folder", error);
          return false;
        }
      }}
    />
  );
};

export type AccountTarget = { id: string; name: string; accountType: string; typeName?: string };

export const DeleteAccountDialog = ({
  account,
  onOpenChange
}: {
  account: AccountTarget | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const remove = useV4Adapter("pam").useDeleteAccount();
  return (
    <ConfirmAction
      open={Boolean(account)}
      onOpenChange={onOpenChange}
      title={`Delete ${account?.name ?? ""}`}
      description={`This permanently deletes the${account?.typeName ? ` ${account.typeName}` : ""} account. This cannot be undone.`}
      confirmText={account?.name}
      action="Delete account"
      onConfirm={async () => {
        if (!account) return false;
        try {
          await remove.mutateAsync({
            accountId: account.id,
            accountType: account.accountType as Parameters<
              typeof remove.mutateAsync
            >[0]["accountType"]
          });
          saved("Account deleted");
          return true;
        } catch (error) {
          failed("Failed to delete account", error);
          return false;
        }
      }}
    />
  );
};

const FolderSettings = ({ folder }: { folder: TPamFolderWithCount }) => {
  const update = useV4Adapter("pam").useUpdateFolder();
  const [nameProblem, setNameProblem] = useState<string>();
  const name = useAutosave({
    value: folder.name,
    errorMessage: "Failed to rename folder",
    onSave: async (next) => {
      await update.mutateAsync({ folderId: folder.id, name: next.trim() });
    }
  });
  const description = useAutosave({
    value: folder.description ?? "",
    errorMessage: "Failed to update folder description",
    onSave: async (next) => {
      await update.mutateAsync({ folderId: folder.id, description: next.trim() || null });
    }
  });
  const descriptionProblem =
    description.value.length > DESCRIPTION_MAX
      ? `Must be ${DESCRIPTION_MAX} characters or fewer`
      : undefined;

  return (
    <SettingsCard
      title="General"
      saveStatus={name.status === "idle" ? description.status : name.status}
    >
      <Stack gap={16}>
        <Field label="Name" error={nameProblem}>
          <Input
            autoComplete="off"
            value={name.value}
            invalid={Boolean(nameProblem)}
            disabled={name.pending}
            onChange={(event) => {
              name.edit(event.target.value);
              setNameProblem(undefined);
            }}
            onBlur={() => {
              const problem = nameError(name.value);
              setNameProblem(problem);
              if (problem) return;
              if (name.value.trim() !== folder.name) name.save(name.value.trim());
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                name.reset();
                setNameProblem(undefined);
              }
            }}
          />
        </Field>
        <Field label="Description" optional error={descriptionProblem}>
          <Textarea
            rows={3}
            value={description.value}
            disabled={description.pending}
            aria-invalid={Boolean(descriptionProblem) || undefined}
            onChange={(event) => description.edit(event.target.value)}
            onBlur={() => {
              if (descriptionProblem) return;
              if (description.value.trim() !== (folder.description ?? ""))
                description.save(description.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") description.reset();
            }}
          />
        </Field>
      </Stack>
    </SettingsCard>
  );
};

const FolderSheetBody = ({
  folder,
  activeTab,
  lead,
  canRevoke,
  onDirtyChange,
  onOpenAlert
}: {
  folder?: TPamFolderWithCount;
  activeTab?: string;
  lead: ReactNode;
  canRevoke: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onOpenAlert: (alert?: TAlert) => void;
}) => {
  if (folder && activeTab === PamSheetTab.Approvals)
    return (
      <FolderApprovals
        folderId={folder.id}
        lead={lead}
        canRevoke={canRevoke}
        onDirtyChange={onDirtyChange}
        onOpenAlert={onOpenAlert}
      />
    );
  let content = (
    <Stack gap={12}>
      <Skeleton height={32} width={240} />
      <Skeleton height={120} />
    </Stack>
  );
  if (folder && activeTab === PamSheetTab.Permissions)
    content = <MembersPanel scope="folder" resourceId={folder.id} />;
  if (folder && activeTab === PamSheetTab.Configuration)
    content = <FolderSettings key={folder.id} folder={folder} />;
  return (
    <SheetBody>
      <Stack gap={24}>
        {lead}
        {content}
      </Stack>
    </SheetBody>
  );
};

const FOLDER_VIEW = "folder";
const ALERT_VIEW = "alert";

export const FolderSheet = ({
  folderId,
  folders,
  onOpenChange
}: {
  folderId?: string;
  folders: TPamFolderWithCount[];
  onOpenChange: (open: boolean) => void;
}) => {
  const pam = useV4Adapter("pam");
  const { tab, setTab } = usePamSheetState("folderId");
  const { data: memberFolders = [] } = pam.useFolders(undefined, {
    enabled: Boolean(folderId) && !folders.some(({ id }) => id === folderId)
  });
  const folder = [...folders, ...memberFolders].find(({ id }) => id === folderId);
  const { can, isLoading } = pam.useFolderActions(folderId ?? "", Boolean(folderId));
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState(FOLDER_VIEW);
  const [alertView, setAlertView] = useState<{ alert?: TAlert; session: number }>({ session: 0 });
  const [alertDirty, setAlertDirty] = useState(false);
  const close = () => {
    setDirty(false);
    setView(FOLDER_VIEW);
    setAlertDirty(false);
    onOpenChange(false);
  };
  const openAlert = (alert?: TAlert) => {
    setAlertView((current) => ({ alert, session: current.session + 1 }));
    setAlertDirty(false);
    setView(ALERT_VIEW);
  };
  const pendingTab = useRef<string | null>(null);
  const guard = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: () => {
      const nextTab = pendingTab.current;
      pendingTab.current = null;
      if (!nextTab) {
        close();
        return;
      }
      setDirty(false);
      setTab(nextTab);
    }
  });
  const requestClose = () => {
    pendingTab.current = null;
    guard.requestDiscard();
  };
  const tabs = isLoading ? [] : FOLDER_TABS.filter(({ action }) => can(action));
  const activeTab = tabs.find(({ value }) => value === tab)?.value ?? tabs[0]?.value;

  const lead = folder && (
    <Stack gap={16}>
      {folder.description && <Text muted>{folder.description}</Text>}
      <DataList
        variant="props"
        items={[
          ["Accounts", String(folder.accountCount)],
          ["Created", format(new Date(folder.createdAt), "MMMM do, yyyy")]
        ]}
      />
      {activeTab && (
        <Tabs
          label="Folder sections"
          value={activeTab}
          tabs={tabs.map(({ value, label }) => ({ value, label }))}
          onChange={(next) => {
            if (dirty) {
              pendingTab.current = next;
              guard.requestDiscard();
              return;
            }
            setTab(next);
          }}
        />
      )}
    </Stack>
  );

  return (
    <>
      <Sheet open={Boolean(folderId)} onOpenChange={(open) => !open && requestClose()}>
        <SheetContent size="lg">
          <SheetViews view={view} onViewChange={setView}>
            <SheetView
              id={FOLDER_VIEW}
              title={folder?.name ?? "Folder"}
              header={
                <SheetHeader>
                  <SheetTitle>{folder?.name ?? "Folder"}</SheetTitle>
                </SheetHeader>
              }
            >
              <FolderSheetBody
                folder={folder}
                activeTab={activeTab}
                lead={lead}
                canRevoke={can(PamResourcePermissionActions.RevokeGrants)}
                onDirtyChange={setDirty}
                onOpenAlert={openAlert}
              />
            </SheetView>
            <SheetView
              id={ALERT_VIEW}
              title={alertView.alert ? "Edit alert" : "New alert"}
              size="lg"
              dirty={alertDirty}
              discardDescription="Your unsaved changes to this alert will be lost."
            >
              {folder && (
                <FolderAlertView
                  key={alertView.session}
                  folderId={folder.id}
                  alert={alertView.alert}
                  onDirtyChange={setAlertDirty}
                />
              )}
            </SheetView>
          </SheetViews>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...guard.discardDialogProps}
        description="Your unsaved folder changes will be lost."
      />
    </>
  );
};
