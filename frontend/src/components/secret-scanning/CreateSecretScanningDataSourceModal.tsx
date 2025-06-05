import { useState } from "react";
import { faArrowUpRightFromSquare, faBookOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
};

const Content = ({ setSelectedDataSource, selectedDataSource, ...props }: ContentProps) => {
  if (selectedDataSource) {
    return (
      <SecretScanningDataSourceForm
        onCancel={() => setSelectedDataSource(null)}
        type={selectedDataSource}
        {...props}
      />
    );
  }

  return <SecretScanningDataSourceSelect onSelect={setSelectedDataSource} />;
};

export const CreateSecretScanningDataSourceModal = ({ onOpenChange, isOpen, ...props }: Props) => {
  const [selectedDataSource, setSelectedDataSource] = useState<SecretScanningDataSource | null>(
    null
  );

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) setSelectedDataSource(null);
        onOpenChange(open);
      }}
    >
      <ModalContent
        title={
          selectedDataSource ? (
            <SecretScanningDataSourceModalHeader isConfigured={false} type={selectedDataSource} />
          ) : (
            <div className="flex items-center text-mineshaft-300">
              Add Data Source
              <a
                target="_blank"
                href="https://infisical.com/docs/documentation/platform/secret-scanning/overview"
                className="mb-1 ml-1"
                rel="noopener noreferrer"
              >
                <div className="inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
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
        onPointerDownOutside={(e) => e.preventDefault()}
        className={selectedDataSource ? "max-w-2xl" : "max-w-3xl"}
        subTitle={
          selectedDataSource ? undefined : "Select a data source to configure secret scanning for."
        }
        bodyClassName="overflow-visible"
      >
        <Content
          onComplete={() => {
            setSelectedDataSource(null);
            onOpenChange(false);
          }}
          selectedDataSource={selectedDataSource}
          setSelectedDataSource={setSelectedDataSource}
          {...props}
        />
      </ModalContent>
    </Modal>
  );
};
