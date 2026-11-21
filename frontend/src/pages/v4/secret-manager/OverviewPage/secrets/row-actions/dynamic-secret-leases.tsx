import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import {
  RowActions,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@infisical/cipher/ui/table";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { format, formatDistance } from "date-fns";
import ms from "ms";
import { z } from "zod";

import type { DynamicSecretResource } from "../flows/dynamic-secret-flow";
import { Gate } from "../flows/shared";
import type { RowActionProps } from "../overview-cells";

import styles from "./dynamic-secret-actions.module.css";

export type DynamicSecretLease = {
  id: string;
  expireAt: string;
  status?: "failed-deletion";
  statusDetails?: string;
};

export const toMs = (value?: string) => {
  if (!value) return undefined;
  try {
    return ms(value) as number | undefined;
  } catch {
    return undefined;
  }
};

const RENEW_FORM_ID = "dynamic-secret-renew-lease-form";

function RenewLeaseDialog({
  entry,
  leaseId,
  onClose,
  onRenew
}: {
  entry: DynamicSecretResource;
  leaseId?: string;
  onClose: () => void;
  onRenew: (leaseId: string, ttl: string) => void;
}) {
  const maxTtlMs = toMs(entry.maxTTL);
  const formSchema = z.object({
    ttl: z.string().superRefine((val, ctx) => {
      if (!val) return;
      const valMs = toMs(val) ?? 0;
      if (valMs < 1000)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "TTL must be greater than 1 second"
        });
      if (maxTtlMs && valMs > maxTtlMs)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `TTL must be less than ${entry.maxTTL}`
        });
    })
  });
  const { control, handleSubmit, reset } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: { ttl: entry.defaultTTL }
  });
  const close = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={Boolean(leaseId)} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renew lease</DialogTitle>
        </DialogHeader>
        <form
          id={RENEW_FORM_ID}
          noValidate
          onSubmit={handleSubmit(({ ttl }) => {
            if (!leaseId) return;
            onRenew(leaseId, ttl || entry.defaultTTL);
            close();
          })}
        >
          <Controller
            control={control}
            name="ttl"
            render={({ field, fieldState: { error } }) => (
              <Field
                wide
                label="TTL"
                description="Added to the current expiration time."
                error={error?.message}
              >
                <Input {...field} invalid={Boolean(error)} />
              </Field>
            )}
          />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={RENEW_FORM_ID}>
            Renew lease
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DynamicSecretLeaseList({
  entry,
  leases,
  loading,
  canRenew,
  onGenerate,
  onRenew,
  onRevoke,
  leaseBlock
}: {
  entry: DynamicSecretResource;
  leases: readonly DynamicSecretLease[];
  loading: boolean;
  canRenew: boolean;
  leaseBlock?: string;
  onGenerate: () => void;
  onRenew: (leaseId: string, ttl: string) => void;
  onRevoke: (leaseId: string, isForced: boolean) => void;
}) {
  const [renewLeaseId, setRenewLeaseId] = useState<string>();
  const [revoke, setRevoke] = useState<{ leaseId: string; isForced: boolean }>();
  const [revokeOpen, setRevokeOpen] = useState(false);

  const head = (
    <TableHeader>
      <TableRow>
        <TableHead>Lease ID</TableHead>
        <TableHead>State</TableHead>
        <TableHead>Expires in</TableHead>
        <TableActionsHead slots={canRenew ? 2 : 1} />
      </TableRow>
    </TableHeader>
  );
  let body;
  if (leaseBlock)
    body = <EmptyState icon="lock" title="Access restricted" description={`${leaseBlock}.`} />;
  else if (loading)
    body = (
      <>
        <span role="status" className="sr-only">
          Loading leases
        </span>
        <Table aria-busy>
          {head}
          <TableBody>
            {[0, 1, 2].map((index) => (
              <TableRow key={index} aria-hidden>
                <TableCell>
                  <Skeleton width={200} />
                </TableCell>
                <TableCell>
                  <Skeleton width={56} height={20} />
                </TableCell>
                <TableCell>
                  <Skeleton width={80} />
                </TableCell>
                <TableActionsCell slots={canRenew ? 2 : 1} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </>
    );
  else if (leases.length === 0)
    body = (
      <EmptyState
        icon="clock"
        title="No active leases"
        actions={
          <Gate reason={leaseBlock}>
            <Button size="sm" disabled={Boolean(leaseBlock)} onClick={onGenerate}>
              Generate lease
            </Button>
          </Gate>
        }
      />
    );
  else
    body = (
      <Table>
        {head}
        <TableBody>
          {leases.map(({ id, expireAt, status, statusDetails }) => {
            const rowActions: RowActionProps = {
              label: id,
              inline: canRenew
                ? [
                    {
                      label: "Renew lease",
                      icon: "sync",
                      disabledReason: leaseBlock,
                      onSelect: () => setRenewLeaseId(id)
                    }
                  ]
                : [],
              menu: (
                <>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={Boolean(leaseBlock)}
                    description={leaseBlock}
                    onSelect={() => {
                      setRevoke({ leaseId: id, isForced: false });
                      setRevokeOpen(true);
                    }}
                  >
                    <Icon name="trash" />
                    Revoke lease
                  </DropdownMenuItem>
                  {status === "failed-deletion" && (
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={Boolean(leaseBlock)}
                      description={
                        leaseBlock ??
                        "Removes it from Infisical without revoking it in the provider."
                      }
                      onSelect={() => {
                        setRevoke({ leaseId: id, isForced: true });
                        setRevokeOpen(true);
                      }}
                    >
                      <Icon name="trash" />
                      Force delete lease
                    </DropdownMenuItem>
                  )}
                </>
              )
            };
            return (
              <RowContextMenu key={id} {...rowActions}>
                <TableRow>
                  <TableCell>
                    <div className={styles.leaseId}>
                      <span className={styles.truncate}>{id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {status ? (
                      <Tooltip
                        content={statusDetails || "The provider could not revoke this lease."}
                      >
                        <Badge tone="bad">
                          <Icon name="alert" />
                          Deletion failed
                        </Badge>
                      </Tooltip>
                    ) : (
                      <Badge tone="ok">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip content={format(new Date(expireAt), "yyyy-MM-dd, hh:mm aaa")}>
                      <span className="capitalize">
                        {formatDistance(new Date(expireAt), new Date())}
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableActionsCell slots={canRenew ? 2 : 1}>
                    <RowActions {...rowActions} />
                  </TableActionsCell>
                </TableRow>
              </RowContextMenu>
            );
          })}
        </TableBody>
      </Table>
    );

  return (
    <>
      {body}
      <RenewLeaseDialog
        entry={entry}
        leaseId={renewLeaseId}
        onClose={() => setRenewLeaseId(undefined)}
        onRenew={onRenew}
      />
      <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <AlertDialogContent tone="danger" confirmText="delete">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {revoke?.isForced ? "Force delete lease?" : "Revoke lease?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {revoke?.isForced
                ? "Removes the lease from Infisical without revoking it in the provider. This cannot be undone."
                : "Revokes the temporary credentials. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => revoke && onRevoke(revoke.leaseId, revoke.isForced)}
            >
              {revoke?.isForced ? "Force delete" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
