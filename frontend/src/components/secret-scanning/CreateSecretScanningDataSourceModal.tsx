import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { TSecretScanningDataSourceForm } from "@app/components/secret-scanning/forms/schemas";
import {
  Button,
  DocumentationLinkBadge,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  SecretScanningDataSource,
  TSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningDataSourceForm } from "./forms";
import { SecretScanningDataSourceModalHeader } from "./SecretScanningDataSourceModalHeader";
import { SecretScanningDataSourceSelect } from "./SecretScanningDataSourceSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

type ContentProps = {
  onComplete: (dataSource: TSecretScanningDataSource) => void;
  selectedDataSource: SecretScanningDataSource | null;
  setSelectedDataSource: (selectedDataSource: SecretScanningDataSource | null) => void;
  initialFormData?: Partial<TSecretScanningDataSourceForm>;
  onCancel: () => void;
  onSubmittingChange: (isSubmitting: boolean) => void;
};

const Content = ({
  setSelectedDataSource,
  selectedDataSource,
  onCancel,
  ...props
}: ContentProps) => {
  if (selectedDataSource) {
    return (
      <SecretScanningDataSourceForm onCancel={onCancel} type={selectedDataSource} {...props} />
    );
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <SecretScanningDataSourceSelect onSelect={setSelectedDataSource} />
      </div>
      <SheetFooter>
        <SheetClose asChild>
          <Button variant="ghost">Cancel</Button>
        </SheetClose>
      </SheetFooter>
    </>
  );
};

export const CreateSecretScanningDataSourceModal = ({ onOpenChange, isOpen, ...props }: Props) => {
  const [selectedDataSource, setSelectedDataSource] = useState<SecretScanningDataSource | null>(
    null
  );
  const [initialFormData, setInitialFormData] = useState<Partial<TSecretScanningDataSourceForm>>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    location: {
      search: { connectionId, connectionName, ...search },
      pathname
    }
  } = useRouterState();

  const navigate = useNavigate();

  useEffect(() => {
    if (connectionId && connectionName) {
      const storedFormData = localStorage.getItem("secretScanningDataSourceFormData");

      if (!storedFormData) return;

      let form: Partial<TSecretScanningDataSourceForm> = {};
      try {
        form = JSON.parse(storedFormData) as TSecretScanningDataSourceForm;
      } catch {
        return;
      } finally {
        localStorage.removeItem("secretScanningDataSourceFormData");
      }

      onOpenChange(true);

      setSelectedDataSource(form.type ?? null);

      setInitialFormData({
        ...form,
        connection: { id: connectionId, name: connectionName }
      });

      navigate({
        to: pathname,
        search
      });
    }
  }, [connectionId, connectionName]);

  const resetModal = () => {
    setSelectedDataSource(null);
    setInitialFormData(undefined);
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          resetModal();
        }
        onOpenChange(open);
      }}
    >
      <SheetContent size="form" isPending={isSubmitting}>
        <SheetHeader>
          {selectedDataSource ? (
            <SecretScanningDataSourceModalHeader isConfigured={false} type={selectedDataSource} />
          ) : (
            <>
              <SheetTitle className="flex items-center gap-x-2">
                Add Data Source
                <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/overview" />
              </SheetTitle>
              <SheetDescription>
                Select a data source to configure secret scanning for.
              </SheetDescription>
            </>
          )}
        </SheetHeader>
        <Content
          onComplete={() => {
            resetModal();
            onOpenChange(false);
          }}
          onCancel={resetModal}
          onSubmittingChange={setIsSubmitting}
          selectedDataSource={selectedDataSource}
          setSelectedDataSource={setSelectedDataSource}
          initialFormData={initialFormData}
          {...props}
        />
      </SheetContent>
    </Sheet>
  );
};
