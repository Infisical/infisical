import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";

type Props = {
  isOpen: boolean;
  folderName: string;
  isLoading: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export const JoinFolderAsAdminModal = ({
  isOpen,
  folderName,
  isLoading,
  onConfirm,
  onOpenChange
}: Props) => (
  <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Join Folder as Admin</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4">
        <p className="text-sm text-muted">
          You&apos;ll become an admin of{" "}
          <span className="font-medium text-foreground">{folderName}</span>, with full access to its
          accounts and members. Any role you already hold on this folder is replaced. The
          folder&apos;s existing admins will be notified, and this is recorded in the audit log.
        </p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="pam" isPending={isLoading} onClick={onConfirm}>
            Join as Admin
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
);
