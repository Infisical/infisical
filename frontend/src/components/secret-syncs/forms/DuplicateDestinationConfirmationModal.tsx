import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  duplicateProjectId?: string;
  isDisabled?: boolean;
};

export const DuplicateDestinationConfirmationModal = ({
  isOpen,
  onOpenChange,
  onConfirm,
  isLoading,
  duplicateProjectId,
  isDisabled
}: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate Destination Configuration</DialogTitle>
          <DialogDescription>
            Another secret sync in your organization is already configured with the same
            destination.{" "}
            <span className={isDisabled ? "text-danger" : ""}>
              {isDisabled
                ? "Your organization does not allow duplicate destination configurations."
                : "Proceeding may cause conflicts or overwrite existing data."}
            </span>
          </DialogDescription>
        </DialogHeader>
        {duplicateProjectId && (
          <p className="text-xs text-mineshaft-400">
            Duplicate found in project ID:{" "}
            <code className="rounded-sm bg-mineshaft-600 px-1 py-0.5 text-mineshaft-200">
              {duplicateProjectId}
            </code>
          </p>
        )}
        {!isDisabled && <p className="text-sm">Are you sure you want to continue?</p>}
        {!isDisabled && (
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" isDisabled={isLoading}>
                Cancel
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button
                onClick={onConfirm}
                variant="danger"
                isPending={isLoading}
                isDisabled={isLoading}
              >
                Continue
              </Button>
            </DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
