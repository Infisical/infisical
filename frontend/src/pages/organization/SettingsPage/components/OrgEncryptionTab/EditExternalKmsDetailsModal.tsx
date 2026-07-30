import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton
} from "@app/components/v3";
import { useGetExternalKmsById } from "@app/hooks/api";
import { ExternalKmsProvider } from "@app/hooks/api/kms/types";

import { AwsKmsForm } from "./AwsKmsForm";
import { GcpKmsForm } from "./GcpKmsForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  kmsId: string;
  provider: ExternalKmsProvider;
};

export const EditExternalKmsDetailsModal = ({ isOpen, onOpenChange, kmsId, provider }: Props) => {
  const { data: kms, isPending } = useGetExternalKmsById({ kmsId, provider });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit KMS Details</DialogTitle>
          <DialogDescription>
            Update the alias and provider configuration for this external KMS.
          </DialogDescription>
        </DialogHeader>
        {isPending && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {kms?.externalKms?.provider === ExternalKmsProvider.Aws && (
          <AwsKmsForm
            kms={kms}
            mode="details"
            onCancel={() => onOpenChange(false)}
            onCompleted={() => onOpenChange(false)}
          />
        )}
        {kms?.externalKms?.provider === ExternalKmsProvider.Gcp && (
          <GcpKmsForm
            kms={kms}
            mode="details"
            onCancel={() => onOpenChange(false)}
            onCompleted={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
