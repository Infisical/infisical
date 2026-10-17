import { useEffect, useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v3";
import { TPkiInstallation, useUpdatePkiInstallation } from "@app/hooks/api";

export const RESCAN_POLL_INTERVAL_MS = 3000;
export const RESCAN_POLL_TIMEOUT_MS = 2 * 60 * 1000;

const MAX_PASSWORD_LENGTH = 1024;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  installation?: TPkiInstallation;
  onSaved?: () => void;
};

export const SetKeystorePasswordDialog = ({
  isOpen,
  onOpenChange,
  projectId,
  installation,
  onSaved
}: Props) => {
  const [password, setPassword] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const updateInstallation = useUpdatePkiInstallation();

  useEffect(() => {
    if (!isOpen) return;
    setPassword("");
    setIsRevealed(false);
  }, [isOpen]);

  if (!installation) return null;

  const isChange = Boolean(installation.hasKeystorePassword);
  const filePath = installation.locationDetails.filePath ?? installation.name ?? "";

  const handleSave = async () => {
    await updateInstallation.mutateAsync({
      installationId: installation.id,
      keystorePassword: password,
      projectId
    });
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isChange ? "Change Password" : "Set Password"}</DialogTitle>
          <DialogDescription>
            The password for <span className="font-mono text-foreground">{filePath}</span>. The file
            is scanned again as soon as you save.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave().catch(() => undefined);
          }}
        >
          <Field>
            <FieldLabel>Keystore Password</FieldLabel>
            <InputGroup>
              <InputGroupInput
                type={isRevealed ? "text" : "password"}
                value={password}
                maxLength={MAX_PASSWORD_LENGTH}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="xs"
                  aria-label={isRevealed ? "Hide password" : "Show password"}
                  onClick={() => setIsRevealed((prev) => !prev)}
                >
                  {isRevealed ? <EyeOffIcon /> : <EyeIcon />}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              Stored encrypted and only used to open this file. Private keys aren&apos;t imported.
            </FieldDescription>
          </Field>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="project"
              isDisabled={!password || updateInstallation.isPending}
              isPending={updateInstallation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
