import { useState } from "react";

import { Sheet, SheetContent, SheetHeader } from "@app/components/v3";
import { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { SecretScanningDataSourceForm } from "./forms";
import { SecretScanningDataSourceModalHeader } from "./SecretScanningDataSourceModalHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  dataSource?: TSecretScanningDataSource;
};

export const EditSecretScanningDataSourceModal = ({ dataSource, isOpen, onOpenChange }: Props) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!dataSource) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent size="form" isPending={isSubmitting}>
        <SheetHeader>
          <SecretScanningDataSourceModalHeader isConfigured type={dataSource.type} />
        </SheetHeader>
        <SecretScanningDataSourceForm
          onComplete={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
          onSubmittingChange={setIsSubmitting}
          dataSource={dataSource}
          type={dataSource.type}
        />
      </SheetContent>
    </Sheet>
  );
};
