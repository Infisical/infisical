import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Code } from "@infisical/cipher/ui/code";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Snippet } from "@infisical/cipher/ui/snippet";

import type { TCreatedEncryptionKeyRotation } from "@app/hooks/api/admin/types";

import { saved } from "../../access/toast";

const GeneratedKey = ({
  generatedKey,
  onClose
}: {
  generatedKey: TCreatedEncryptionKeyRotation;
  onClose: () => void;
}) => {
  const [acceptsReplacement, setAcceptsReplacement] = useState(false);
  const removes = generatedKey.removesExpiringKey;
  return (
    <DialogContent style={{ maxWidth: 720 }}>
      <DialogHeader>
        <DialogTitle>Copy your new encryption key</DialogTitle>
        <DialogDescription>
          This is the only time it is shown. If you lose it before applying it, discard it and
          generate another.
        </DialogDescription>
      </DialogHeader>
      <Stack gap={16}>
        <Field label="Set this environment variable" wide>
          <Snippet
            label="Encryption key environment variable"
            value={`ENCRYPTION_KEY=${generatedKey.key}`}
            copyLabel="Copy encryption key"
            onCopy={() => saved("Copied encryption key")}
          />
        </Field>
        <Field
          wide
          label="Label"
          description="Store this alongside the key. It is how you identify which key a database backup needs."
        >
          <Snippet
            label="Key label"
            value={generatedKey.label}
            copyLabel="Copy key label"
            onCopy={() => saved("Copied key label")}
          />
        </Field>
        {removes && (
          <Checkbox
            checked={acceptsReplacement}
            onChange={setAcceptsReplacement}
            label={
              <>
                Applying this key removes{" "}
                {removes.label ? (
                  <>
                    the key labeled <Code>{removes.label}</Code>
                  </>
                ) : (
                  "the key still expiring from an earlier rotation"
                )}
                . Any instance that started on this removed key will fail. The current active key
                will not be removed, it will become the new expiring key.
              </>
            }
          />
        )}
        <Alert tone="info">
          Nothing has changed yet. Deploy this value, and the rotation takes effect when the first
          instance starts with it.
        </Alert>
      </Stack>
      <DialogFooter>
        <Button
          variant="primary"
          disabledReason={
            removes && !acceptsReplacement ? "Confirm that the expiring key is removed" : undefined
          }
          onClick={onClose}
        >
          I have stored the key
        </Button>
      </DialogFooter>
    </DialogContent>
  );
};

export const GeneratedKeyDialog = ({
  generatedKey,
  onClose
}: {
  generatedKey: TCreatedEncryptionKeyRotation | null;
  onClose: () => void;
}) => (
  <Dialog open={Boolean(generatedKey)} onOpenChange={(open) => !open && onClose()}>
    {generatedKey && (
      <GeneratedKey key={generatedKey.label} generatedKey={generatedKey} onClose={onClose} />
    )}
  </Dialog>
);
