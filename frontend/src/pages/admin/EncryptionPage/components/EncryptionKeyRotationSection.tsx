import { useState } from "react";
import { AlertTriangleIcon, KeyRoundIcon, ShieldAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  CopyButton,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  useCreateEncryptionKeyRotation,
  useDeleteExpiringEncryptionKey,
  useDeleteStagedEncryptionKey,
  useGetEncryptionKeyRotations,
  useGetEncryptionRootKey
} from "@app/hooks/api";
import {
  RootKeyEncryptionStrategy,
  TCreatedEncryptionKeyRotation
} from "@app/hooks/api/admin/types";

export const EncryptionKeyRotationSection = () => {
  const { data: rootKey, isPending, isError } = useGetEncryptionRootKey();
  const { mutateAsync: createRotation, isPending: isCreating } = useCreateEncryptionKeyRotation();
  const { mutateAsync: deleteStagedKey } = useDeleteStagedEncryptionKey();
  const { mutateAsync: deleteExpiringKey, isPending: isRemoving } =
    useDeleteExpiringEncryptionKey();

  const [generatedKey, setGeneratedKey] = useState<TCreatedEncryptionKeyRotation | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [overrideStraggler, setOverrideStraggler] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const { data: rotationsPage } = useGetEncryptionKeyRotations({
    offset: (page - 1) * perPage,
    limit: perPage
  });

  if (isError || (!isPending && !rootKey)) {
    return (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Root encryption key</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="warning">
            <AlertTriangleIcon />
            <AlertTitle>Encryption status could not be loaded</AlertTitle>
            <AlertDescription>
              Reload the page to try again. While this is unavailable you cannot generate, discard,
              or remove an encryption key from here.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isPending || !rootKey) return null;

  const isHsmManaged = rootKey.encryptionStrategy === RootKeyEncryptionStrategy.HSM;

  const handleGenerate = async () => {
    const rotation = await createRotation({ replaceStaged: Boolean(rootKey.staged) });
    setGeneratedKey(rotation);
  };

  const handleDiscard = async () => {
    if (!rootKey.staged?.label) return;
    await deleteStagedKey({ label: rootKey.staged.label });
    createNotification({ type: "success", text: "Generated encryption key discarded." });
  };

  const handleRemoveExpiring = async () => {
    if (!rootKey.expiring?.label) return;
    await deleteExpiringKey({
      label: rootKey.expiring.label,
      force: overrideStraggler
    });
    setAcknowledged(false);
    setOverrideStraggler(false);
    createNotification({ type: "success", text: "Previous encryption key removed." });
  };

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Root encryption key</CardTitle>
          <CardDescription>
            Rotate the key that protects every secret in this instance. Generating a key changes
            nothing on its own: the rotation takes effect the first time an instance starts with the
            new value.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm">
            <KeyRoundIcon className="size-4 text-foreground/60" />
            <span className="text-foreground/70">Active key</span>
            <Badge variant="neutral" className="font-mono">
              {rootKey.active.label ?? "managed by HSM"}
            </Badge>
            <span className="text-xs text-foreground/60">
              in use since {new Date(rootKey.active.activatedAt).toLocaleString()}
            </span>
          </div>

          {isHsmManaged ? (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertDescription>
                This instance wraps its root key with an HSM, so there is no environment variable to
                rotate. Rotate the key on the HSM itself, or switch the encryption strategy to
                software first.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleGenerate} isPending={isCreating}>
                {rootKey.staged ? "Generate a replacement key" : "Generate new key"}
              </Button>
              {rootKey.staged && (
                <Button variant="danger" isDisabled={!rootKey.staged.label} onClick={handleDiscard}>
                  Discard generated key
                </Button>
              )}
            </div>
          )}

          {rootKey.expiring && (
            <Alert variant="warning">
              <ShieldAlertIcon />
              <AlertTitle>The previous key still works</AlertTitle>
              <AlertDescription>
                <p>
                  Until it is removed, the old key still opens this database, so the rotation has
                  not reduced exposure yet. It also means an instance that has not restarted onto
                  the new key can still start.
                </p>
                <p className="mt-2">
                  {rootKey.expiring.lastResolvedAt
                    ? `An instance last started on it ${new Date(
                        rootKey.expiring.lastResolvedAt
                      ).toLocaleString()}. Roll that instance onto the new key first.`
                    : "No instance has started on it since the rotation. Instances that have not restarted yet will not have reported."}
                </p>
                <p className="mt-2">
                  It is removed automatically after{" "}
                  {new Date(rootKey.expiring.expiresAt).toLocaleString()}. If an instance starts
                  with this key before the expiry date, it will delay removal.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {rootKey.expiring.lastResolvedAt && (
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="override-straggler"
                        isChecked={overrideStraggler}
                        onCheckedChange={(value) => setOverrideStraggler(value === true)}
                      />
                      <Label htmlFor="override-straggler" className="text-xs font-normal">
                        Remove it even though an instance reported starting on it. That instance
                        will fail its next restart until it is given the new key.
                      </Label>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="ack-remove-old-key"
                      isChecked={acknowledged}
                      onCheckedChange={(value) => setAcknowledged(value === true)}
                    />
                    <Label htmlFor="ack-remove-old-key" className="text-xs font-normal">
                      I have stored the new key somewhere I can recover it, and I understand that
                      database backups taken before this rotation will need the old key, which is
                      about to be removed.
                    </Label>
                  </div>
                  <Button
                    className="self-start"
                    variant="danger"
                    isDisabled={!acknowledged || !rootKey.expiring.label}
                    isPending={isRemoving}
                    onClick={handleRemoveExpiring}
                  >
                    Remove previous key
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {(rootKey.staged || (rotationsPage?.rotations.length ?? 0) > 0) && (
            <div>
              <p className="mb-2 text-sm font-medium">Key history</p>
              <p className="mb-2 text-xs text-foreground/60">
                Kept after a key is removed. Use the label to work out which archived key a restored
                backup needs.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Active from</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Pinned rather than a row of the list: a staged key has never encrypted anything,
                      so it is deliberately absent from the history the recovery path reads. */}
                  {rootKey.staged && page === 1 && (
                    <TableRow key="staged">
                      <TableCell className="font-mono text-xs">
                        {rootKey.staged.label ?? "unlabelled"}
                      </TableCell>
                      <TableCell className="text-foreground/50">
                        generated {new Date(rootKey.staged.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="info">Staged, not applied</Badge>
                      </TableCell>
                    </TableRow>
                  )}
                  {rotationsPage?.rotations.map((entry) => (
                    <TableRow key={entry.label + entry.activatedAt}>
                      <TableCell className="font-mono text-xs">{entry.label}</TableCell>
                      <TableCell>{new Date(entry.activatedAt).toLocaleString()}</TableCell>
                      <TableCell>
                        {!entry.supersededAt && <Badge variant="success">Active</Badge>}
                        {entry.supersededAt && !entry.retiredAt && (
                          <Badge variant="neutral">
                            {rootKey.expiring?.label === entry.label
                              ? `Expires ${new Date(rootKey.expiring.expiresAt).toLocaleDateString()}`
                              : "Expiring"}
                          </Badge>
                        )}
                        {entry.retiredAt && <Badge variant="neutral">Removed</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(rotationsPage?.totalCount ?? 0) > perPage && (
                <Pagination
                  count={rotationsPage?.totalCount ?? 0}
                  page={page}
                  perPage={perPage}
                  onChangePage={setPage}
                  onChangePerPage={(rows) => {
                    setPerPage(rows);
                    setPage(1);
                  }}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(generatedKey)} onOpenChange={(open) => !open && setGeneratedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your new encryption key</DialogTitle>
            <DialogDescription>
              This is the only time it will be shown. If you lose it before applying it, discard it
              and generate another.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Set this environment variable</p>
              <div className="flex items-center gap-2 rounded-md border border-border bg-container px-3 py-2 font-mono text-sm">
                <span className="flex-1 break-all">ENCRYPTION_KEY={generatedKey?.key}</span>
                <CopyButton
                  value={`ENCRYPTION_KEY=${generatedKey?.key}`}
                  ariaLabel="Copy encryption key"
                />
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium">Label</p>
              <p className="font-mono text-xs text-foreground/70">{generatedKey?.label}</p>
              <p className="mt-1 text-xs text-foreground/60">
                Store this alongside the key. It is how you identify which key a database backup
                needs.
              </p>
            </div>

            {generatedKey?.removesExpiringKey && (
              <Alert variant="warning">
                <AlertTriangleIcon />
                <AlertTitle>This will remove your previous key</AlertTitle>
                <AlertDescription>
                  <p>
                    The key from your last rotation has not been removed yet. Applying this new key
                    removes it immediately, and any instance still running it will fail to restart.
                  </p>
                  {generatedKey.removesExpiringKey.lastResolvedAt && (
                    <p className="mt-2">
                      An instance started on it{" "}
                      {new Date(generatedKey.removesExpiringKey.lastResolvedAt).toLocaleString()}.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Alert variant="info">
              <AlertDescription>
                Nothing has changed yet. Deploy this value, and the rotation takes effect when the
                first instance starts with it.
              </AlertDescription>
            </Alert>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setGeneratedKey(null)}>I have stored the key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
