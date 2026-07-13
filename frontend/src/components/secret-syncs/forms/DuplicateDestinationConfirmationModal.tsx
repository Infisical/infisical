import { AlertTriangleIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
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
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-lg!">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <AlertTriangleIcon className="text-danger" />
          </AlertDialogMedia>
          <AlertDialogTitle>Duplicate Destination Configuration</AlertDialogTitle>
          <AlertDialogDescription>
            Another secret sync in your organization is already configured with the same
            destination.{" "}
            <span className={isDisabled ? "text-danger" : ""}>
              {isDisabled
                ? "Your organization does not allow duplicate destination configurations."
                : "Proceeding may cause conflicts or overwrite existing data."}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-xs text-mineshaft-400">
          {duplicateProjectId ? (
            <>
              Duplicate found in project ID:{" "}
              <code className="rounded-sm bg-mineshaft-600 px-1 py-0.5 text-mineshaft-200">
                {duplicateProjectId}
              </code>
            </>
          ) : (
            "Duplicate found in another project in your organization."
          )}
        </p>
        {!isDisabled && <p className="text-sm">Are you sure you want to continue?</p>}
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={isLoading}>
            {isDisabled ? "Close" : "Cancel"}
          </AlertDialogCancel>
          {!isDisabled && (
            <AlertDialogAction variant="danger" isDisabled={isLoading} onClick={onConfirm}>
              Continue
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
