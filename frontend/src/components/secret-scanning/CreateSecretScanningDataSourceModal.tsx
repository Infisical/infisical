import { useEffect, useState } from "react";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { TSecretScanningDataSourceForm } from "@app/components/secret-scanning/forms/schemas";
import { Modal, ModalContent } from "@app/components/v2";
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

  return <SecretScanningDataSourceSelect onSelect={setSelectedDataSource} />;
};

export const CreateSecretScanningDataSourceModal = ({ onOpenChange, isOpen, ...props }: Props) => {
  const [selectedDataSource, setSelectedDataSource] = useState<SecretScanningDataSource | null>(
    null
  );
  const [initialFormData, setInitialFormData] = useState<Partial<TSecretScanningDataSourceForm>>();

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
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          resetModal();
        }
        onOpenChange(open);
      }}
    >
      <ModalContent
        title={
          selectedDataSource ? (
            <SecretScanningDataSourceModalHeader isConfigured={false} type={selectedDataSource} />
          ) : (
            <div className="text-mineshaft-300 flex items-center">
              Add Data Source
              <a
                target="_blank"
                href="https://infisical.com/docs/documentation/platform/secret-scanning/overview"
                className="mb-1 ml-1"
                rel="noopener noreferrer"
              >
                <div className="bg-yellow/20 text-yellow inline-block rounded-md px-1.5 text-sm opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mb-[0.03rem] mr-1 text-[12px]" />
                  <span>Docs</span>
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.07rem] ml-1 text-[10px]"
                  />
                </div>
              </a>
            </div>
          )
        }
        className={selectedDataSource ? "max-w-2xl" : "max-w-3xl"}
        subTitle={
          selectedDataSource ? undefined : "Select a data source to configure secret scanning for."
        }
        bodyClassName="overflow-visible"
      >
        <Content
          onComplete={() => {
            resetModal();
            onOpenChange(false);
          }}
          onCancel={resetModal}
          selectedDataSource={selectedDataSource}
          setSelectedDataSource={setSelectedDataSource}
          initialFormData={initialFormData}
          {...props}
        />
      </ModalContent>
    </Modal>
  );
};
