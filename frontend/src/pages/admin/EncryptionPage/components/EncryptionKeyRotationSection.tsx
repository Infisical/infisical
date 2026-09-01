import { useState } from "react";
import {
  AlertTriangleIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleSlashIcon,
  ClockIcon,
  InfoIcon,
  PlusIcon,
  ShieldAlertIcon,
  ShieldOffIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
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
  IconButton,
  Label,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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
  const { mutateAsync: deleteStagedKey, isPending: isDiscarding } = useDeleteStagedEncryptionKey();
  const { mutateAsync: deleteExpiringKey, isPending: isRemoving } =
    useDeleteExpiringEncryptionKey();

  const [generatedKey, setGeneratedKey] = useState<TCreatedEncryptionKeyRotation | null>(null);
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [acceptsKeyReplacement, setAcceptsKeyReplacement] = useState(false);
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
          <CardTitle>Root Encryption Keys</CardTitle>
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
    setAcceptsKeyReplacement(false);
    setGeneratedKey(rotation);
  };

  const handleDiscard = async () => {
    if (!rootKey.staged?.label) return;
    await deleteStagedKey({ label: rootKey.staged.label });
    createNotification({ type: "success", text: "Generated encryption key discarded." });
  };

  const closeDeactivateDialog = () => {
    setIsDeactivateOpen(false);
    setAcknowledged(false);
    setOverrideStraggler(false);
  };

  const handleRemoveExpiring = async () => {
    if (!rootKey.expiring?.label) return;
    try {
      await deleteExpiringKey({
        label: rootKey.expiring.label,
        force: overrideStraggler
      });
    } catch {
      // Reported globally by MutationCache.onError; keep the dialog open so the operator can retry.
      return;
    }
    closeDeactivateDialog();
    createNotification({ type: "success", text: "Previous encryption key deactivated." });
  };

  return (
    <>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Root Encryption Keys</CardTitle>
          <CardDescription>
            Rotate the key that protects every secret in this instance. Every key is kept here after
            it is removed, so you can tell which archived key a restored backup needs.
          </CardDescription>
          {!isHsmManaged && (
            <CardAction>
              <Button size="lg" onClick={handleGenerate} isPending={isCreating}>
                <PlusIcon />
                Generate New Key
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isHsmManaged && (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertDescription>
                This instance wraps its root key with an HSM, so there is no environment variable to
                rotate. Rotate the key on the HSM itself, or switch the encryption strategy to
                software first.
              </AlertDescription>
            </Alert>
          )}

          {rootKey.expiring && (
            <Alert variant="warning">
              <ShieldAlertIcon />
              <AlertTitle>Root encryption key rotation in progress</AlertTitle>
              <AlertDescription>
                <p>
                  The previous key is still active. Once all instances have been migrated to the new
                  encryption key it is safe to remove this key.
                </p>
                <p className="mt-2">
                  This key will be automatically removed on{" "}
                  {new Date(rootKey.expiring.expiresAt).toLocaleDateString()} at{" "}
                  {new Date(rootKey.expiring.expiresAt).toLocaleTimeString()}.{" "}
                  <button
                    type="button"
                    className="cursor-pointer underline underline-offset-4 hover:text-foreground"
                    onClick={() => setIsDeactivateOpen(true)}
                  >
                    Deactivate Now
                  </button>
                </p>
              </AlertDescription>
            </Alert>
          )}

          {(rootKey.staged || (rotationsPage?.rotations.length ?? 0) > 0) && (
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Active From</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead variant="action" className="pr-3" />
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
                        <Badge variant="info">
                          <CircleDashedIcon />
                          Staged, Not Applied
                        </Badge>
                      </TableCell>
                      <TableCell variant="action" className="pr-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <IconButton
                              className="text-foreground/70 hover:bg-danger/10 hover:text-danger"
                              size="sm"
                              variant="ghost"
                              aria-label="Discard generated key"
                              isDisabled={!rootKey.staged.label}
                              isPending={isDiscarding}
                              onClick={handleDiscard}
                            >
                              <Trash2Icon />
                            </IconButton>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            Delete this generated key. It has never encrypted anything, so nothing
                            is lost.
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  )}
                  {rotationsPage?.rotations.map((entry) => (
                    <TableRow key={entry.label + entry.activatedAt}>
                      <TableCell className="font-mono text-xs">{entry.label}</TableCell>
                      <TableCell>{new Date(entry.activatedAt).toLocaleString()}</TableCell>
                      <TableCell>
                        {!entry.supersededAt && (
                          <Badge variant="success">
                            <CircleCheckIcon />
                            Active
                          </Badge>
                        )}
                        {entry.supersededAt &&
                          !entry.retiredAt &&
                          (rootKey.expiring?.label === entry.label ? (
                            <Badge variant="warning">
                              <ClockIcon />
                              Expires {new Date(rootKey.expiring.expiresAt).toLocaleDateString()}
                            </Badge>
                          ) : (
                            <Badge variant="neutral">
                              <ClockIcon />
                              Expiring
                            </Badge>
                          ))}
                        {entry.retiredAt && (
                          <Badge variant="neutral">
                            <CircleSlashIcon />
                            Removed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell variant="action" className="pr-3">
                        {rootKey.expiring?.label === entry.label && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <IconButton
                                className="text-foreground/70 hover:bg-warning/10 hover:text-warning"
                                size="sm"
                                variant="ghost"
                                aria-label="Deactivate old key"
                                onClick={() => setIsDeactivateOpen(true)}
                              >
                                <ShieldOffIcon />
                              </IconButton>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Deactivate the old key, removing its access to the database. Backups
                              taken before the rotation can still only be opened with it, so keep it
                              archived.
                            </TooltipContent>
                          </Tooltip>
                        )}
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

      {rootKey.expiring && (
        <AlertDialog
          open={isDeactivateOpen}
          onOpenChange={(open) => {
            if (isRemoving) return;
            if (open) setIsDeactivateOpen(true);
            else closeDeactivateDialog();
          }}
        >
          <AlertDialogContent className="sm:max-w-xl!">
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate the Previous Key</AlertDialogTitle>
              <AlertDialogDescription>
                The key{" "}
                {rootKey.expiring.label ? (
                  <span className="font-mono text-foreground">{rootKey.expiring.label}</span>
                ) : (
                  "from your last rotation"
                )}{" "}
                stops opening this database. It stays in the key history so you can tell which
                archived key a restored backup needs.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {rootKey.expiring.lastResolvedAt ? (
              <Alert variant="warning">
                <AlertTriangleIcon />
                <AlertTitle>An instance may still be running on this key</AlertTitle>
                <AlertDescription>
                  One last started on it{" "}
                  {new Date(rootKey.expiring.lastResolvedAt).toLocaleString()}. That is the last
                  time the key was used. Check your fleet before continuing: an instance that never
                  restarted onto the new key fails its next restart.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="success">
                <CircleCheckIcon />
                <AlertTitle>No instance is running on this key</AlertTitle>
                <AlertDescription>
                  Nothing has started on it since the rotation. Instances that have not restarted
                  yet will not have reported.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-3">
              {rootKey.expiring.lastResolvedAt && (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="override-straggler"
                    variant="warning"
                    isChecked={overrideStraggler}
                    onCheckedChange={(value) => setOverrideStraggler(value === true)}
                  />
                  <Label htmlFor="override-straggler" className="text-xs font-normal text-label">
                    I have verified that no Infisical instance is still running with the old key,
                    and I understand that any instance that has not been given the new key will fail
                    its next restart.
                  </Label>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="ack-remove-old-key"
                  variant="warning"
                  isChecked={acknowledged}
                  onCheckedChange={(value) => setAcknowledged(value === true)}
                />
                <Label htmlFor="ack-remove-old-key" className="text-xs font-normal text-label">
                  I have archived the old key somewhere I can recover it. Database backups taken
                  before this rotation can only be opened with it, and it cannot be recovered from
                  here.
                </Label>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel isDisabled={isRemoving}>Cancel</AlertDialogCancel>
              <Button
                variant="danger"
                size="sm"
                isDisabled={
                  !acknowledged ||
                  !rootKey.expiring.label ||
                  (Boolean(rootKey.expiring.lastResolvedAt) && !overrideStraggler)
                }
                isPending={isRemoving}
                onClick={handleRemoveExpiring}
              >
                Deactivate Key
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Dialog open={Boolean(generatedKey)} onOpenChange={(open) => !open && setGeneratedKey(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Copy Your New Encryption Key</DialogTitle>
            <DialogDescription>
              This is the only time it will be shown. If you lose it before applying it, discard it
              and generate another.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-accent">Set this environment variable</span>
              <div className="flex items-center gap-2 rounded-md border border-border bg-container p-2">
                <p className="grow font-mono text-sm break-all text-foreground">
                  ENCRYPTION_KEY={generatedKey?.key}
                </p>
                <CopyButton
                  value={`ENCRYPTION_KEY=${generatedKey?.key}`}
                  ariaLabel="Copy encryption key"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-accent">Label</span>
              <div className="flex items-center gap-2 rounded-md border border-border bg-container p-2">
                <p className="grow font-mono text-sm break-all text-foreground">
                  {generatedKey?.label}
                </p>
                <CopyButton value={generatedKey?.label ?? ""} ariaLabel="Copy key label" />
              </div>
              <p className="mt-1 text-xs text-accent">
                Store this alongside the key. It is how you identify which key a database backup
                needs.
              </p>
            </div>

            {generatedKey?.removesExpiringKey && (
              <div className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 p-3">
                <Checkbox
                  id="ack-replaces-expiring-key"
                  variant="warning"
                  isChecked={acceptsKeyReplacement}
                  onCheckedChange={(value) => setAcceptsKeyReplacement(value === true)}
                />
                <Label
                  htmlFor="ack-replaces-expiring-key"
                  className="text-xs font-normal text-label"
                >
                  <span>
                    Applying this key removes{" "}
                    {generatedKey.removesExpiringKey.label ? (
                      <span className="font-mono text-foreground">
                        {generatedKey.removesExpiringKey.label}
                      </span>
                    ) : (
                      "the key still expiring from an earlier rotation"
                    )}
                    , already expiring from an earlier rotation. My active key is not removed, it
                    becomes the new expiring key.
                    {generatedKey.removesExpiringKey.lastResolvedAt &&
                      ` An instance last started on the removed key ${new Date(
                        generatedKey.removesExpiringKey.lastResolvedAt
                      ).toLocaleString()} and would fail its next restart, if not updated.`}
                  </span>
                </Label>
              </div>
            )}

            <Alert variant="info">
              <InfoIcon />
              <AlertDescription>
                Nothing has changed yet. Deploy this value, and the rotation takes effect when the
                first instance starts with it.
              </AlertDescription>
            </Alert>
          </DialogBody>
          <DialogFooter>
            <Button
              isDisabled={Boolean(generatedKey?.removesExpiringKey) && !acceptsKeyReplacement}
              onClick={() => setGeneratedKey(null)}
            >
              I Have Stored the Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
