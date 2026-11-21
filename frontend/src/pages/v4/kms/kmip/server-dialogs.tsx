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
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";

import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import type { TKmipServer, TKmipServerWithAuthMethod } from "@app/hooks/api/kmipServers/types";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { HOSTNAMES_HINT, hostnamesError, keyAlgorithmOptions } from "./shared";

export const DeleteKmipServerDialog = ({
  server,
  detail = false,
  onClose,
  onDeleted
}: {
  server: TKmipServer;
  detail?: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const remove = useV4Adapter("kmip").useDeleteServer();
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText={server.name}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete KMIP server ${server.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {detail
              ? "Deployed instances lose access and KMIP clients can no longer reach it. This cannot be undone."
              : "This permanently removes the KMIP server from your organization. This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              try {
                await remove.mutateAsync(server.id);
                saved("Successfully deleted KMIP server");
                onClose();
                onDeleted?.();
              } catch (error) {
                failed("Failed to delete KMIP server", error);
              }
            }}
          >
            Delete KMIP server
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const RevokeKmipServerDialog = ({
  server,
  onClose,
  onRevoked
}: {
  server: TKmipServer;
  onClose: () => void;
  onRevoked: () => void;
}) => {
  const revoke = useV4Adapter("kmip").useRevokeServerAccess();
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger">
        <AlertDialogHeader>
          <AlertDialogTitle>{`Revoke access for KMIP server ${server.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            The server is disconnected and its active tokens are invalidated. It must
            re-authenticate to reconnect.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              try {
                await revoke.mutateAsync({ kmipServerId: server.id });
                onRevoked();
                saved("KMIP server access revoked");
                onClose();
              } catch (error) {
                failed("Failed to revoke KMIP server access", error);
              }
            }}
          >
            Revoke access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const methodOptions = [
  { value: "token", label: "Token auth" },
  { value: "aws", label: "AWS auth" }
];

export const AuthMethodDialog = ({
  server,
  onClose,
  onChanged
}: {
  server: TKmipServerWithAuthMethod;
  onClose: () => void;
  onChanged: () => void;
}) => {
  const update = useV4Adapter("kmip").useUpdateServer();
  const aws = server.authMethod.method === "aws" ? server.authMethod.config : undefined;
  const initial = {
    method: aws ? "aws" : "token",
    arns: aws?.allowedPrincipalArns ?? "",
    accounts: aws?.allowedAccountIds ?? ""
  };
  const [method, setMethod] = useState(initial.method);
  const [arns, setArns] = useState(initial.arns);
  const [accounts, setAccounts] = useState(initial.accounts);
  const [errors, setErrors] = useState<{ arns?: string; accounts?: string }>({});
  const [pending, setPending] = useState(false);
  const dirty = method !== initial.method || arns !== initial.arns || accounts !== initial.accounts;

  const submit = async () => {
    const next: { arns?: string; accounts?: string } = {};
    if (method === "aws") {
      if (arns.length > 4096) next.arns = "Allowed principal ARNs must be at most 4096 characters";
      if (accounts.length > 2048)
        next.accounts = "Allowed account IDs must be at most 2048 characters";
      if (!arns.trim() && !accounts.trim()) {
        const message = "Set at least one of allowed principal ARNs or allowed account IDs";
        next.arns = message;
        next.accounts = message;
      }
    }
    setErrors(next);
    if (next.arns || next.accounts) return;
    setPending(true);
    try {
      await update.mutateAsync({
        kmipServerId: server.id,
        authMethod:
          method === "aws"
            ? { method: "aws", allowedPrincipalArns: arns, allowedAccountIds: accounts }
            : { method: "token" }
      });
      onChanged();
      saved("Auth method updated");
      onClose();
    } catch (error) {
      failed("Failed to update auth method", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Edit auth method</DialogTitle>
        </DialogHeader>
        <form
          id="kmip-server-auth"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field label="Method">
              <Select label="Method" value={method} options={methodOptions} onChange={setMethod} />
            </Field>
            {method === "aws" && (
              <>
                <Field
                  label="Allowed principal ARNs"
                  description="Comma-separated. Set this, allowed account IDs, or both."
                  error={errors.arns}
                >
                  <Input
                    placeholder="arn:aws:iam::123456789012:role/MyRoleName"
                    value={arns}
                    invalid={Boolean(errors.arns)}
                    onChange={(event) => setArns(event.target.value)}
                  />
                </Field>
                <Field label="Allowed account IDs" error={errors.accounts}>
                  <Input
                    placeholder="123456789012, 210987654321"
                    value={accounts}
                    invalid={Boolean(errors.accounts)}
                    onChange={(event) => setAccounts(event.target.value)}
                  />
                </Field>
              </>
            )}
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="kmip-server-auth"
            loading={pending}
            disabledReason={dirty ? undefined : "No changes to save"}
          >
            Update auth method
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const CertConfigDialog = ({
  server,
  onClose
}: {
  server: TKmipServerWithAuthMethod;
  onClose: () => void;
}) => {
  const update = useV4Adapter("kmip").useUpdateServer();
  const initial = {
    hostnames: server.hostnamesOrIps ?? "",
    keyAlgorithm: (server.keyAlgorithm as CertKeyAlgorithm) ?? CertKeyAlgorithm.RSA_2048
  };
  const [hostnames, setHostnames] = useState(initial.hostnames);
  const [keyAlgorithm, setKeyAlgorithm] = useState<string>(initial.keyAlgorithm);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const dirty = hostnames !== initial.hostnames || keyAlgorithm !== initial.keyAlgorithm;

  const submit = async () => {
    const next = hostnamesError(hostnames);
    setError(next);
    if (next) return;
    setPending(true);
    try {
      await update.mutateAsync({
        kmipServerId: server.id,
        hostnamesOrIps: hostnames.trim(),
        keyAlgorithm: keyAlgorithm as CertKeyAlgorithm
      });
      saved(
        "Certificate configuration updated. It applies at the next automatic renewal; restart the KMIP server to apply it now."
      );
      onClose();
    } catch (failure) {
      failed("Failed to update certificate configuration", failure);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Edit certificate configuration</DialogTitle>
          <DialogDescription>
            Changes apply when the server next renews its certificate. Restart it to apply them now.
          </DialogDescription>
        </DialogHeader>
        <form
          id="kmip-server-cert"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field label="Hostnames or IPs" description={HOSTNAMES_HINT} error={error}>
              <Input
                autoFocus
                placeholder="kmip.example.com, 10.0.0.5"
                value={hostnames}
                invalid={Boolean(error)}
                onChange={(event) => setHostnames(event.target.value)}
              />
            </Field>
            <Field label="Key algorithm" description="Signs the server certificate.">
              <Select
                label="Key algorithm"
                value={keyAlgorithm}
                options={keyAlgorithmOptions}
                onChange={setKeyAlgorithm}
              />
            </Field>
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="kmip-server-cert"
            loading={pending}
            disabledReason={dirty ? undefined : "No changes to save"}
          >
            Update certificate configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
