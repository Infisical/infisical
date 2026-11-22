import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  ConfirmationAlertDialog
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

  if (accountCount > 0) {
    return (
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${templateName}"`}</AlertDialogTitle>
            <AlertDialogDescription>
              This template is used by {accountCount} account{accountCount === 1 ? "" : "s"}. Update{" "}
              {accountCount === 1 ? "it" : "them"} to use a different template or delete{" "}
              {accountCount === 1 ? "it" : "them"} before this template can be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <ConfirmationAlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete "${templateName}"`}
      description="This permanently deletes the template. This cannot be undone."
      confirmKey={templateName}
      isPending={isDeleting}
      onConfirm={() => {
        if (template) onConfirm(template.id);
      }}
    />
  );
};
