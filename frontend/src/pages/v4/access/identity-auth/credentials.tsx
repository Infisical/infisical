import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { List, ListRow } from "@infisical/cipher/ui/list";
import { MultiStep } from "@infisical/cipher/ui/multi-step";
import { Snippet } from "@infisical/cipher/ui/snippet";

import type { ClientSecretData, IdentityAccessToken } from "@app/hooks/api/identities/types";

import { useV4Adapter } from "../../data/adapters";
import { formatDate } from "../roles";
import { failed, readableFailure, saved } from "../toast";
import { Gate, RESTRICTED } from "../ui";

const NumberField = ({
  label,
  value,
  error,
  placeholder,
  description,
  disabled,
  min = 0,
  onChange
}: {
  label: string;
  value: string;
  error?: string;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  min?: number;
  onChange: (value: string) => void;
}) => (
  <Field label={label} error={error} description={description}>
    <Input
      type="number"
      min={min}
      step={1}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      invalid={Boolean(error)}
      onChange={(event) => onChange(event.target.value)}
    />
  </Field>
);

const usesLabel = (used: number, limit: number) =>
  limit > 0 ? `${used} of ${limit} uses` : `${used} ${used === 1 ? "use" : "uses"}`;

const expiryLabel = (createdAt: string, ttlSeconds: number) => {
  if (ttlSeconds <= 0) return "never expires";
  const end = new Date(new Date(createdAt).getTime() + ttlSeconds * 1000);
  return `${end.getTime() < Date.now() ? "expired" : "expires"} ${formatDate(end)}`;
};

const CreatedSecretDialog = ({
  title,
  description,
  label,
  value,
  onClose
}: {
  title: string;
  description: string;
  label: string;
  value?: string;
  onClose: () => void;
}) => (
  <Dialog open={Boolean(value)} onOpenChange={(open) => !open && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field label={label} wide>
        <Snippet label={label} value={value ?? ""} />
      </Field>
      <DialogFooter>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

const RevokeDialog = ({
  title,
  description,
  open,
  onCancel,
  onConfirm
}: {
  title: string;
  description: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
    <AlertDialogContent tone="danger">
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onClick={onConfirm}>
          Revoke
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

const CreateButton = ({ allowed, onClick }: { allowed: boolean; onClick: () => void }) => (
  <Gate allowed={allowed}>
    <Button variant="outline" size="sm" icon="plus" disabled={!allowed} onClick={onClick}>
      Create
    </Button>
  </Gate>
);

const RevokeMenu = ({
  allowed,
  renameAllowed,
  label,
  onClick,
  onRename
}: {
  allowed: boolean;
  renameAllowed?: boolean;
  label: string;
  onClick: () => void;
  onRename?: () => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon-sm" icon="more" iconOnly>
        {`More actions for ${label}`}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      {onRename && (
        <DropdownMenuItem
          disabled={!renameAllowed}
          description={renameAllowed ? undefined : RESTRICTED}
          onSelect={onRename}
        >
          <Icon name="pencil" />
          Rename
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        variant="destructive"
        disabled={!allowed}
        description={allowed ? undefined : RESTRICTED}
        onSelect={onClick}
      >
        <Icon name="trash" />
        Revoke
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export const ClientSecrets = ({
  identityId,
  canCreate,
  canRevoke
}: {
  identityId: string;
  canCreate: boolean;
  canRevoke: boolean;
}) => {
  const access = useV4Adapter("access");
  const { data: secrets = [], isPending } =
    access.useIdentityUniversalAuthClientSecrets(identityId);
  const create = access.useCreateIdentityUniversalAuthClientSecret();
  const revoke = access.useRevokeIdentityUniversalAuthClientSecret();
  const empty = { description: "", ttl: "", numUsesLimit: "" };
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<{ ttl?: string; numUsesLimit?: string }>({});
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<string>();
  const [revoking, setRevoking] = useState<ClientSecretData>();

  const close = () => {
    setCreating(false);
    setForm(empty);
    setErrors({});
  };

  const submit = async () => {
    const next = {
      ttl: form.ttl && !/^\d+$/.test(form.ttl) ? "Enter a whole number" : undefined,
      numUsesLimit:
        form.numUsesLimit && !/^\d+$/.test(form.numUsesLimit) ? "Enter a whole number" : undefined
    };
    setErrors(next);
    if (next.ttl || next.numUsesLimit) return;
    setPending(true);
    try {
      const result = await create.mutateAsync({
        identityId,
        description: form.description.trim(),
        ttl: Number(form.ttl || 0),
        numUsesLimit: Number(form.numUsesLimit || 0)
      });
      close();
      setCreated(result.clientSecret);
    } catch (error) {
      failed("Failed to create client secret", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <List
        label="Client secrets"
        title="Client secrets"
        loading={isPending}
        loadingRows={2}
        action={<CreateButton allowed={canCreate} onClick={() => setCreating(true)} />}
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="key"
            title="No client secrets have been generated"
          />
        }
      >
        {secrets.map((secret) => (
          <ListRow
            key={secret.id}
            value={secret.id}
            label={secret.description || secret.clientSecretPrefix}
            title={secret.description || "No description"}
            description={
              <>
                Starts with <code>{secret.clientSecretPrefix}</code>,{" "}
                {usesLabel(secret.clientSecretNumUses, secret.clientSecretNumUsesLimit)},{" "}
                {expiryLabel(secret.createdAt, secret.clientSecretTTL)}
              </>
            }
            actions={
              <RevokeMenu
                allowed={canRevoke}
                label={secret.description || secret.clientSecretPrefix}
                onClick={() => setRevoking(secret)}
              />
            }
          />
        ))}
      </List>
      <Dialog open={creating} onOpenChange={(open) => !open && close()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Create client secret</DialogTitle>
          </DialogHeader>
          <form
            id="create-client-secret"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Stack gap={16}>
              <Field label="Description (optional)">
                <Input
                  autoFocus
                  placeholder="Description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>
              <NumberField
                label="TTL in seconds (optional)"
                placeholder="0"
                description="Leave empty or 0 to never expire."
                value={form.ttl}
                error={errors.ttl}
                onChange={(ttl) => setForm({ ...form, ttl })}
              />
              <NumberField
                label="Max number of uses (optional)"
                placeholder="Unlimited uses"
                value={form.numUsesLimit}
                error={errors.numUsesLimit}
                onChange={(numUsesLimit) => setForm({ ...form, numUsesLimit })}
              />
            </Stack>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="create-client-secret" loading={pending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreatedSecretDialog
        title="Client secret created"
        description="Copy it now. You won't be able to see it again."
        label="Client secret"
        value={created}
        onClose={() => setCreated(undefined)}
      />
      <RevokeDialog
        open={Boolean(revoking)}
        title={`Revoke the client secret starting with ${revoking?.clientSecretPrefix ?? ""}?`}
        description="Anything using this client secret will stop authenticating."
        onCancel={() => setRevoking(undefined)}
        onConfirm={async () => {
          if (!revoking) return;
          setRevoking(undefined);
          try {
            await revoke.mutateAsync({ identityId, clientSecretId: revoking.id });
            saved("Successfully deleted client secret");
          } catch (error) {
            failed("Failed to delete client secret", error);
          }
        }}
      />
    </>
  );
};

const RenameTokenDialog = ({
  identityId,
  token,
  onClose
}: {
  identityId: string;
  token: IdentityAccessToken;
  onClose: () => void;
}) => {
  const update = useV4Adapter("access").useUpdateIdentityTokenAuthToken();
  const [name, setName] = useState(token.name ?? "");
  const [completed, setCompleted] = useState(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: !completed && name !== (token.name ?? ""),
    onDiscard: onClose
  });
  return (
    <>
      <MultiStep
        variant="dialog"
        open
        title="Rename access token"
        completeLabel="Save"
        onOpenChange={(open) => !open && requestDiscard()}
        onComplete={async () => {
          await update
            .mutateAsync({ identityId, tokenId: token.id, name: name.trim() })
            .catch(readableFailure("Couldn't rename access token"));
          saved("Access token renamed");
          setCompleted(true);
          onClose();
        }}
        steps={[
          {
            title: "Name",
            validate: () => (name.trim() ? true : { fields: { name: "Enter a name" } }),
            content: (
              <Field label="Name" name="name">
                <Input
                  placeholder="My token"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog {...discardDialogProps} title="Discard the new name?" />
    </>
  );
};

export const AccessTokens = ({
  identityId,
  canCreate,
  canRevoke
}: {
  identityId: string;
  canCreate: boolean;
  canRevoke: boolean;
}) => {
  const access = useV4Adapter("access");
  const { data: tokens = [], isPending } = access.useIdentityTokenAuthTokens(identityId);
  const create = access.useCreateIdentityTokenAuthToken();
  const revoke = access.useRevokeIdentityTokenAuthToken();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<string>();
  const [revoking, setRevoking] = useState<IdentityAccessToken>();
  const [renaming, setRenaming] = useState<IdentityAccessToken>();

  const close = () => {
    setCreating(false);
    setName("");
    setError(undefined);
  };

  const submit = async () => {
    if (!name.trim()) {
      setError("Required");
      return;
    }
    setPending(true);
    try {
      const result = await create.mutateAsync({ identityId, name: name.trim() });
      close();
      setCreated(result.accessToken);
    } catch (cause) {
      failed("Failed to create access token", cause);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <List
        label="Access tokens"
        title="Access tokens"
        loading={isPending}
        loadingRows={2}
        action={<CreateButton allowed={canCreate} onClick={() => setCreating(true)} />}
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="key"
            title="No access tokens have been generated"
          />
        }
      >
        {tokens
          .filter((token) => !token.isAccessTokenRevoked)
          .map((token) => (
            <ListRow
              key={token.id}
              value={token.id}
              label={token.name || token.id}
              title={<code>{token.name || "Unnamed token"}</code>}
              description={`${usesLabel(token.accessTokenNumUses, token.accessTokenNumUsesLimit)}, ${expiryLabel(token.createdAt, token.accessTokenTTL)}`}
              actions={
                <RevokeMenu
                  allowed={canRevoke}
                  renameAllowed={canCreate}
                  label={token.name || token.id}
                  onClick={() => setRevoking(token)}
                  onRename={() => setRenaming(token)}
                />
              }
            />
          ))}
      </List>
      <Dialog open={creating} onOpenChange={(open) => !open && close()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Create access token</DialogTitle>
          </DialogHeader>
          <form
            id="create-access-token"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Field label="Name" error={error}>
              <Input
                autoFocus
                placeholder="My token"
                value={name}
                invalid={Boolean(error)}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(undefined);
                }}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="create-access-token" loading={pending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreatedSecretDialog
        title="Access token created"
        description="Copy it now. You won't be able to see it again."
        label="Access token"
        value={created}
        onClose={() => setCreated(undefined)}
      />
      <RevokeDialog
        open={Boolean(revoking)}
        title={`Revoke ${revoking?.name || "this access token"}?`}
        description="Anything using this access token will stop authenticating."
        onCancel={() => setRevoking(undefined)}
        onConfirm={async () => {
          if (!revoking) return;
          setRevoking(undefined);
          try {
            await revoke.mutateAsync({ identityId, tokenId: revoking.id });
            saved(`Successfully revoked token ${revoking.name ?? ""}`.trim());
          } catch (cause) {
            failed("Failed to revoke access token", cause);
          }
        }}
      />
      {renaming && (
        <RenameTokenDialog
          identityId={identityId}
          token={renaming}
          onClose={() => setRenaming(undefined)}
        />
      )}
    </>
  );
};
