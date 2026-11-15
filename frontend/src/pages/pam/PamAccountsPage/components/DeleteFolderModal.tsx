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
  if (accountCount > 0) {
    return (
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete "${folderName}"`}</AlertDialogTitle>
            <AlertDialogDescription>
              This folder contains {accountCount} account{accountCount === 1 ? "" : "s"}. Move or
              delete {accountCount === 1 ? "it" : "them"} before this folder can be deleted.
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
      title={`Delete "${folderName}"`}
      description="This permanently deletes the folder. This cannot be undone."
      confirmKey={folderName}
      isPending={isLoading}
      onConfirm={onConfirm}
    />
  );
};
