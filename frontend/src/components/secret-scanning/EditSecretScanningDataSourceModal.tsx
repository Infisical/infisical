import { useState } from "react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@app/components/v3";
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
          <SheetTitle className="sr-only">Edit Data Source</SheetTitle>
          <SecretScanningDataSourceModalHeader isConfigured type={dataSource.type} />
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SecretScanningDataSourceForm
            onComplete={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
            onSubmittingChange={setIsSubmitting}
            dataSource={dataSource}
            type={dataSource.type}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
