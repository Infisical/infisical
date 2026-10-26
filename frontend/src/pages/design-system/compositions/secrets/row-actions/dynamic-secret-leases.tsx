import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, formatDistance } from "date-fns";
import ms from "ms";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline } from "@app/components/v4/ui/layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import type { DynamicSecretResource } from "../flows/dynamic-secret-flow";

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
          <DialogDescription>Extend this lease by a new TTL.</DialogDescription>
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
                description="The existing expiration time will be extended by this TTL."
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

export function DynamicSecretLeasesDialog({
  entry: openEntry,
  leases,
  canRenew,
  onClose,
  onNewLease,
  onRenew,
  onRevoke
}: {
  entry?: DynamicSecretResource;
  leases: readonly DynamicSecretLease[];
  canRenew: boolean;
  onClose: () => void;
  onNewLease: () => void;
  onRenew: (leaseId: string, ttl: string) => void;
  onRevoke: (leaseId: string, isForced: boolean) => void;
}) {
  const lastEntry = useRef(openEntry);
  if (openEntry) lastEntry.current = openEntry;
  const entry = openEntry ?? lastEntry.current;
  const [renewLeaseId, setRenewLeaseId] = useState<string>();
  const [revoke, setRevoke] = useState<{ leaseId: string; isForced: boolean }>();
  const [revokeOpen, setRevokeOpen] = useState(false);
  if (!entry) return null;

  return (
    <>
      <Dialog open={Boolean(openEntry)} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className={styles.leasesDialog}>
          <DialogHeader>
            <DialogTitle>
              <Inline gap={8}>
                Dynamic secret leases
                <Badge tone="outline">{entry.name}</Badge>
              </Inline>
            </DialogTitle>
            <DialogDescription>Revoke or renew active leases.</DialogDescription>
          </DialogHeader>
          {leases.length === 0 ? (
            <EmptyState
              icon="clock"
              title="No leases found"
              description="Provision a lease to generate temporary credentials from this dynamic secret."
              actions={
                <Button size="sm" onClick={onNewLease}>
                  New lease
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lease ID</TableHead>
                  <TableHead>Expires at</TableHead>
                  <TableHead className={styles.actionColumn} aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {leases.map(({ id, expireAt, status, statusDetails }) => (
                  <TableRow key={id}>
                    <TableCell>
                      <div className={styles.leaseId}>
                        <span className={styles.truncate}>{id}</span>
                        {status && (
                          <Tooltip wrap content={statusDetails || status}>
                            <span className={styles.warn} aria-label="Lease warning">
                              <Icon name="alert" size={16} />
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tooltip content={format(new Date(expireAt), "yyyy-MM-dd, hh:mm aaa")}>
                        <span className="capitalize">
                          {formatDistance(new Date(expireAt), new Date())}
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className={styles.actions}>
                        {canRenew && (
                          <Tooltip content="Renew lease">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              iconOnly
                              icon="sync"
                              aria-label="Renew lease"
                              onClick={() => setRenewLeaseId(id)}
                            />
                          </Tooltip>
                        )}
                        <Tooltip content="Revoke lease">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            iconOnly
                            icon="trash"
                            aria-label="Revoke lease"
                            onClick={() => {
                              setRevoke({ leaseId: id, isForced: false });
                              setRevokeOpen(true);
                            }}
                          />
                        </Tooltip>
                        {status === "failed-deletion" && (
                          <Tooltip
                            wrap
                            content="Force delete lease. This removes the lease from Infisical without revoking it in the external provider."
                          >
                            <Button
                              variant="danger-ghost"
                              size="icon-xs"
                              iconOnly
                              icon="trash"
                              aria-label="Force delete lease"
                              onClick={() => {
                                setRevoke({ leaseId: id, isForced: true });
                                setRevokeOpen(true);
                              }}
                            />
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {leases.length > 0 && (
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button onClick={onNewLease}>New lease</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
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
                ? "This removes the lease from Infisical without revoking it in the external provider. This cannot be undone."
                : "This revokes the temporary credentials and deletes the lease. This cannot be undone."}
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
