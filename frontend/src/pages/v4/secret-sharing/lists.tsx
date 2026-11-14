import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { SecretValue } from "@infisical/cipher/ui/sensitive-editor";
import { SmallText } from "@infisical/cipher/ui/text";
import { format } from "date-fns";

import { SecretSharingAccessType, type TSharedSecret } from "@app/hooks/api/secretSharing/types";

import { failed, toast } from "../access/toast";
import { useV4Adapter } from "../data/adapters";
import { secretRequestLink, sharedSecretLink, writeLink } from "./links";

const PAGE_SIZES = [10, 20, 50, 100];

export const formatDate = (value: Date | string) => format(new Date(value), "MMM d, yyyy h:mm a");

const muted = (text: string) => <SmallText muted>{text}</SmallText>;

const isPast = (value: Date | string | null) => value !== null && new Date(value) < new Date();

const usePaging = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const pagination = (label: string, total?: number) =>
    total ? (
      <Pagination
        label={label}
        variant="compact"
        page={page}
        onPageChange={setPage}
        total={total}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZES}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    ) : undefined;
  return { dto: { offset: (page - 1) * pageSize, limit: pageSize }, pagination };
};

const DeleteDialog = ({
  target,
  title,
  description,
  onClose,
  onConfirm
}: {
  target?: TSharedSecret;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: (row: TSharedSecret) => Promise<void>;
}) => (
  <AlertDialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
    <AlertDialogContent tone="danger">
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onClick={async () => {
            if (target) await onConfirm(target);
            onClose();
          }}
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const sharedStatus = (row: TSharedSecret) => {
  if (row.expiresAfterViews !== null && row.expiresAfterViews <= 0)
    return <Badge tone="bad">Views used</Badge>;
  if (isPast(row.expiresAt)) return <Badge tone="bad">Expired</Badge>;
  return <Badge tone="ok">Active</Badge>;
};

export const SharedSecretsTable = ({ subOrganization }: { subOrganization?: string }) => {
  const sharing = useV4Adapter("secretSharing");
  const { dto, pagination } = usePaging();
  const { data, isPending, error } = sharing.useSharedSecrets(dto);
  const deleteSharedSecret = sharing.useDeleteSharedSecret();
  const [deleting, setDeleting] = useState<TSharedSecret>();
  const columns: DataTableColumn<TSharedSecret>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (row) => row.name ?? "",
      render: (row) => row.name || muted("Unnamed secret")
    },
    { id: "created", header: "Created", width: 176, render: (row) => formatDate(row.createdAt) },
    { id: "expires", header: "Expires", width: 176, render: (row) => formatDate(row.expiresAt) },
    {
      id: "views",
      header: "Views remaining",
      width: 136,
      render: (row) => (row.expiresAfterViews !== null ? row.expiresAfterViews : muted("Unlimited"))
    },
    {
      id: "opened",
      header: "Last opened",
      width: 176,
      render: (row) => (row.lastViewedAt ? formatDate(row.lastViewedAt) : muted("Not opened yet"))
    },
    { id: "status", header: "Status", width: 112, render: sharedStatus }
  ];
  return (
    <>
      <DataTable
        label="Shared secrets"
        rows={error ? [] : (data?.secrets ?? [])}
        columns={columns}
        loading={isPending}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.name || "Unnamed secret"}
        rowActions={{
          inline: [
            {
              label: "Copy link",
              icon: "link",
              onSelect: (row) =>
                writeLink(sharedSecretLink(row.id, subOrganization), {
                  copied: "Shared secret link copied to clipboard"
                })
            }
          ],
          menuLabel: "Shared secret options",
          renderMenu: (row) => (
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
              <Icon name="trash" />
              Delete shared secret
            </DropdownMenuItem>
          )
        }}
        empty={
          error ? (
            <EmptyState
              size="sm"
              media="bare"
              icon="alert"
              title="Could not load shared secrets"
              description="Refresh the page to try again."
            />
          ) : (
            <EmptyState
              size="sm"
              media="bare"
              icon="link"
              title="No shared secrets"
              description="Create a secure link to share sensitive information."
            />
          )
        }
        pagination={pagination("Shared secret pages", error ? 0 : data?.totalCount)}
      />
      <DeleteDialog
        target={deleting}
        title={`Delete ${deleting?.name || "this shared secret"}?`}
        description="The link stops working for everyone. You cannot undo this."
        onClose={() => setDeleting(undefined)}
        onConfirm={async (row) => {
          try {
            await deleteSharedSecret.mutateAsync({ sharedSecretId: row.id });
            toast({ tone: "ok", title: `Deleted ${row.name || "shared secret"}` });
          } catch (deleteError) {
            failed("Could not delete the shared secret", deleteError);
          }
        }}
      />
    </>
  );
};

const requestStatus = (row: TSharedSecret) => {
  if (row.encryptedSecret) return <Badge tone="ok">Secret provided</Badge>;
  if (isPast(row.expiresAt)) return <Badge tone="bad">Expired</Badge>;
  return <Badge tone="warn">Pending secret</Badge>;
};

export const SecretRequestsTable = ({ subOrganization }: { subOrganization?: string }) => {
  const sharing = useV4Adapter("secretSharing");
  const { dto, pagination } = usePaging();
  const { data, isPending, error } = sharing.useSecretRequests(dto);
  const deleteSecretRequest = sharing.useDeleteSecretRequest();
  const revealSecretValue = sharing.useRevealSecretRequestValue();
  const [deleting, setDeleting] = useState<TSharedSecret>();
  const [revealed, setRevealed] = useState<{ name: string | null; value: string }>();
  const columns: DataTableColumn<TSharedSecret>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (row) => row.name ?? "",
      render: (row) => row.name || muted("Unnamed request")
    },
    {
      id: "access",
      header: "Who can respond",
      width: 152,
      render: (row) =>
        row.accessType === SecretSharingAccessType.Anyone ? (
          <Badge tone="soft">
            <Icon name="globe" size={12} />
            Anyone
          </Badge>
        ) : (
          <Badge tone="soft">
            <Icon name="building" size={12} />
            Organization
          </Badge>
        )
    },
    { id: "created", header: "Created", width: 176, render: (row) => formatDate(row.createdAt) },
    {
      id: "expires",
      header: "Expires",
      width: 176,
      render: (row) => (row.expiresAt ? formatDate(row.expiresAt) : muted("Never"))
    },
    { id: "status", header: "Status", width: 136, render: requestStatus }
  ];
  return (
    <>
      <DataTable
        label="Secret requests"
        rows={error ? [] : (data?.secrets ?? [])}
        columns={columns}
        loading={isPending}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.name || "Unnamed request"}
        rowActions={{
          inline: [
            {
              label: "Reveal secret",
              icon: "eye",
              disabledReason: (row) =>
                row.encryptedSecret ? undefined : "No secret has been submitted yet",
              onSelect: async (row) => {
                try {
                  const request = await revealSecretValue.mutateAsync({ id: row.id });
                  setRevealed({ name: request.name, value: request.secretValue });
                } catch (revealError) {
                  failed("Could not reveal the secret", revealError);
                }
              }
            },
            {
              label: "Copy request link",
              icon: "link",
              disabledReason: (row) => {
                if (row.encryptedSecret) return "A secret was already submitted";
                if (isPast(row.expiresAt)) return "This request has expired";
                return undefined;
              },
              onSelect: (row) =>
                writeLink(secretRequestLink(row.id, subOrganization), {
                  copied: "Secret request link copied to clipboard"
                })
            }
          ],
          menuLabel: "Secret request options",
          renderMenu: (row) => (
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
              <Icon name="trash" />
              Delete request
            </DropdownMenuItem>
          )
        }}
        empty={
          error ? (
            <EmptyState
              size="sm"
              media="bare"
              icon="alert"
              title="Could not load secret requests"
              description="Refresh the page to try again."
            />
          ) : (
            <EmptyState
              size="sm"
              media="bare"
              icon="inbox"
              title="No secret requests"
              description="Create a link that lets someone send you a secret securely."
            />
          )
        }
        pagination={pagination("Secret request pages", error ? 0 : data?.totalCount)}
      />
      <DeleteDialog
        target={deleting}
        title={`Delete ${deleting?.name || "this secret request"}?`}
        description="The link stops accepting a secret. You cannot undo this."
        onClose={() => setDeleting(undefined)}
        onConfirm={async (row) => {
          try {
            await deleteSecretRequest.mutateAsync({ secretRequestId: row.id });
            toast({ tone: "ok", title: `Deleted ${row.name || "secret request"}` });
          } catch (deleteError) {
            failed("Could not delete the secret request", deleteError);
          }
        }}
      />
      <Dialog open={Boolean(revealed)} onOpenChange={(open) => !open && setRevealed(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{revealed?.name || "Requested secret"}</DialogTitle>
          </DialogHeader>
          <SecretValue
            value={revealed?.value ?? ""}
            label="Requested secret value"
            onCopy={() => toast({ tone: "ok", title: "Secret value copied to clipboard" })}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
