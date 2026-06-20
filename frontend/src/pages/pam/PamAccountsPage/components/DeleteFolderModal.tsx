import { useEffect, useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  Input
} from "@app/components/v3";

type Props = {
  isOpen: boolean;
  folderName: string;
  accountCount?: number;
  isLoading: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export const DeleteFolderModal = ({
  isOpen,
  folderName,
  accountCount = 0,
  isLoading,
  onConfirm,
  onOpenChange
}: Props) => {
  const [confirmInput, setConfirmInput] = useState("");
  const canDelete = confirmInput === folderName && folderName.length > 0;
  const hasAccounts = accountCount > 0;

  useEffect(() => {
    setConfirmInput("");
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Delete Folder</DialogTitle>
        </DialogHeader>

        {hasAccounts ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted">
              <span className="font-medium text-foreground">{folderName}</span> contains{" "}
              {accountCount} account{accountCount === 1 ? "" : "s"}. Move or delete{" "}
              {accountCount === 1 ? "it" : "them"} before this folder can be deleted.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canDelete && !isLoading) onConfirm();
            }}
          >
            <p className="text-sm text-muted">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{folderName}</span>? This action cannot
              be undone.
            </p>
            <Field>
              <FieldLabel>
                Type <span className="font-medium text-foreground">{folderName}</span> to confirm
              </FieldLabel>
              <FieldContent>
                <Input
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder={folderName}
                />
              </FieldContent>
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" isPending={isLoading} isDisabled={!canDelete}>
                Delete
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
