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
  kmsId: string;
  provider: ExternalKmsProvider;
  onOpenChange: (state: boolean) => void;
};

export const EditExternalKmsCredentialsModal = ({
  isOpen,
  kmsId,
  provider,
  onOpenChange
}: Props) => {
  const { data: kms, isPending } = useGetExternalKmsById({ kmsId, provider });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit KMS Credentials</DialogTitle>
          <DialogDescription>
            Update the credentials, region, and key used by this external KMS.
          </DialogDescription>
        </DialogHeader>
        {isPending && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {kms?.externalKms?.provider === ExternalKmsProvider.Aws && (
          <AwsKmsForm
            kms={kms}
            mode="credentials"
            onCancel={() => onOpenChange(false)}
            onCompleted={() => onOpenChange(false)}
          />
        )}
        {kms?.externalKms?.provider === ExternalKmsProvider.Gcp && (
          <GcpKmsForm
            kms={kms}
            mode="credentials"
            onCancel={() => onOpenChange(false)}
            onCompleted={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
