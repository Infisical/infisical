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
  CopyButton,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  useCompleteEncryptionKeyRotation,
  useCreateEncryptionKeyRotation,
  useDiscardEncryptionKeyRotation,
  useGetEncryptionStatus
} from "@app/hooks/api";
import {
  EncryptionRotationBlocker,
  TCreatedEncryptionKeyRotation
} from "@app/hooks/api/admin/types";

const BLOCKER_COPY: Record<EncryptionRotationBlocker, string> = {
  [EncryptionRotationBlocker.HsmStrategy]:
    "This instance wraps its root key with an HSM, so there is no environment variable to rotate. Rotate the key on the HSM itself.",
  [EncryptionRotationBlocker.RotationPending]:
    "A key has already been generated and is waiting to be applied. Apply it, discard it, or generate a replacement."
};

export const EncryptionKeyRotationSection = () => {
  const { data: status, isPending } = useGetEncryptionStatus();
  const { mutateAsync: createRotation, isPending: isCreating } = useCreateEncryptionKeyRotation();
  const { mutateAsync: discardRotation } = useDiscardEncryptionKeyRotation();
  const { mutateAsync: completeRotation, isPending: isCompleting } =
    useCompleteEncryptionKeyRotation();

  const [generatedKey, setGeneratedKey] = useState<TCreatedEncryptionKeyRotation | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  if (isPending || !status) return null;

  const rotateBlockers = status.blockers.filter(
    (blocker) => blocker !== EncryptionRotationBlocker.RotationPending
  );
  const canRotate = rotateBlockers.length === 0;

  const handleGenerate = async () => {
    const rotation = await createRotation({ supersede: Boolean(status.pendingRotation) });
    setGeneratedKey(rotation);
  };

  const handleDiscard = async () => {
    if (!status.pendingRotation) return;
    await discardRotation(status.pendingRotation.id);
    createNotification({ type: "success", text: "Generated encryption key discarded." });
  };

  const handleComplete = async () => {
    if (!status.retainedKey) return;
    await completeRotation({ rotationId: status.retainedKey.id, acknowledged });
    setAcknowledged(false);
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
              {status.activeFingerprint ?? "managed by HSM"}
            </Badge>
          </div>

          {status.blockers.map((blocker) => (
            <Alert
              key={blocker}
              variant={blocker === EncryptionRotationBlocker.RotationPending ? "info" : "warning"}
            >
              <AlertTriangleIcon />
              <AlertDescription>{BLOCKER_COPY[blocker]}</AlertDescription>
            </Alert>
          ))}

          {canRotate && (
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleGenerate} isPending={isCreating}>
                {status.pendingRotation ? "Generate a replacement key" : "Generate new key"}
              </Button>
              {status.pendingRotation && (
                <Button variant="danger" onClick={handleDiscard}>
                  Discard generated key
                </Button>
              )}
            </div>
          )}

          {status.retainedKey && (
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
                  {status.retainedKey.lastResolvedAt
                    ? `An instance last started on it ${new Date(
                        status.retainedKey.lastResolvedAt
                      ).toLocaleString()}. Roll that instance onto the new key first.`
                    : "No instance has started on it since the rotation. Instances that have not restarted yet will not have reported."}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <label className="flex items-start gap-2 text-xs" htmlFor="ack-remove-old-key">
                    <input
                      id="ack-remove-old-key"
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      I have stored the new key somewhere I can recover it, and I understand that
                      database backups taken before this rotation will need the old key, which is
                      about to be removed.
                    </span>
                  </label>
                  <Button
                    className="self-start"
                    variant="danger"
                    isDisabled={!acknowledged}
                    isPending={isCompleting}
                    onClick={handleComplete}
                  >
                    Remove previous key
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {status.history.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Key history</p>
              <p className="mb-2 text-xs text-foreground/60">
                Kept after a key is removed. Use the fingerprint to work out which archived key a
                restored backup needs.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fingerprint</TableHead>
                    <TableHead>Active from</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status.history.map((entry) => (
                    <TableRow key={entry.kekFingerprint + entry.activatedAt}>
                      <TableCell className="font-mono text-xs">{entry.kekFingerprint}</TableCell>
                      <TableCell>{new Date(entry.activatedAt).toLocaleString()}</TableCell>
                      <TableCell>
                        {!entry.supersededAt && <Badge variant="success">Active</Badge>}
                        {entry.supersededAt && !entry.retiredAt && (
                          <Badge variant="neutral">Superseded</Badge>
                        )}
                        {entry.retiredAt && <Badge variant="neutral">Removed</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
              <p className="mb-1.5 text-sm font-medium">Fingerprint</p>
              <p className="font-mono text-xs text-foreground/70">{generatedKey?.fingerprint}</p>
              <p className="mt-1 text-xs text-foreground/60">
                Store this alongside the key. It is how you identify which key a database backup
                needs.
              </p>
            </div>

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
