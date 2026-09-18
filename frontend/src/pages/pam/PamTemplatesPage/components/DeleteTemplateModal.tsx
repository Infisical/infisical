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
import { TPamAccountTemplateWithCount } from "@app/hooks/api/pam";

type Props = {
  template?: TPamAccountTemplateWithCount;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (templateId: string) => void;
  isDeleting: boolean;
};

export const DeleteTemplateModal = ({
  template,
  isOpen,
  onOpenChange,
  onConfirm,
  isDeleting
}: Props) => {
  const templateName = template?.name ?? "";
  const accountCount = template?.accountCount ?? 0;
  const hasAccounts = accountCount > 0;

  const [confirmInput, setConfirmInput] = useState("");
  const canDelete = confirmInput === templateName && templateName.length > 0;

  useEffect(() => {
    setConfirmInput("");
  }, [isOpen]);

  const renderBody = () => {
    if (hasAccounts) {
      return (
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">{templateName}</span> is used by{" "}
            {accountCount} account{accountCount === 1 ? "" : "s"}. Update them to use a different
            template or delete {accountCount === 1 ? "it" : "them"} before this template can be
            deleted.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </div>
      );
    }

    return (
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canDelete && !isDeleting && template) onConfirm(template.id);
        }}
      >
        <p className="text-sm text-muted">
          Are you sure you want to delete{" "}
          <span className="font-medium text-foreground">{templateName}</span>? This action cannot be
          undone.
        </p>
        <Field>
          <FieldLabel>
            Type <span className="font-medium text-foreground">{templateName}</span> to confirm
          </FieldLabel>
          <FieldContent>
            <Input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={templateName}
            />
          </FieldContent>
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" isPending={isDeleting} isDisabled={!canDelete}>
            Delete
          </Button>
        </DialogFooter>
      </form>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Delete Template</DialogTitle>
        </DialogHeader>
        {renderBody()}
      </DialogContent>
    </Dialog>
  );
};
