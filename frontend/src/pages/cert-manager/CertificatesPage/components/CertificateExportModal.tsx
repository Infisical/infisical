import { useEffect, useState } from "react";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["certificateExport"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["certificateExport"]>,
    state?: boolean
  ) => void;
  onFormatSelected: (format: "pem" | "jks", serialNumber: string, options?: ExportOptions) => void;
};

export type CertificateExportFormat = "pem" | "jks";

export type ExportOptions = {
  jks?: {
    password: string;
    alias: string;
  };
};

export const CertificateExportModal = ({ popUp, handlePopUpToggle, onFormatSelected }: Props) => {
  const [selectedFormat, setSelectedFormat] = useState<CertificateExportFormat>("pem");
  const [jksOptions, setJksOptions] = useState({
    password: "",
    alias: ""
  });

  const serialNumber =
    (popUp?.certificateExport?.data as { serialNumber: string })?.serialNumber || "";

  // Reset form whenever the modal opens
  useEffect(() => {
    if (popUp?.certificateExport?.isOpen) {
      setSelectedFormat("pem");
      setJksOptions({
        password: "",
        alias: ""
      });
    }
  }, [popUp?.certificateExport?.isOpen]);

  const isFormValid = () => {
    if (selectedFormat === "jks") {
      return jksOptions.password.trim() !== "" && jksOptions.alias.trim() !== "";
    }
    return true;
  };

  const handleExport = () => {
    if (serialNumber && isFormValid()) {
      const options: ExportOptions = {};

      if (selectedFormat === "jks") {
        options.jks = jksOptions;
      }

      onFormatSelected(selectedFormat, serialNumber, options);
      handlePopUpToggle("certificateExport", false);
    }
  };

  return (
    <Modal
      isOpen={popUp?.certificateExport?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificateExport", isOpen);
      }}
    >
      <ModalContent title="Export Certificate">
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Choose the format for exporting your certificate</p>

          <FormControl
            label="Export Format"
            helperText={
              selectedFormat === "pem"
                ? "Privacy Enhanced Mail - Text-based certificate format"
                : "PKCS12 format - Binary keystore format compatible with Java applications"
            }
          >
            <Select
              className="w-full"
              value={selectedFormat}
              onValueChange={(value) => setSelectedFormat(value as CertificateExportFormat)}
            >
              <SelectItem value="pem">PEM Format</SelectItem>
              <SelectItem value="jks">PKCS12 Format</SelectItem>
            </Select>
          </FormControl>

          {selectedFormat === "jks" && (
            <>
              <FormControl
                label="Keystore Password"
                helperText="Password to protect the PKCS12 keystore"
              >
                <Input
                  placeholder="Enter keystore password"
                  value={jksOptions.password}
                  onChange={(e) => setJksOptions((prev) => ({ ...prev, password: e.target.value }))}
                  type="password"
                />
              </FormControl>

              <FormControl
                label="Certificate Alias"
                helperText="Friendly name for the certificate in the keystore"
              >
                <Input
                  placeholder="Enter certificate alias"
                  value={jksOptions.alias}
                  onChange={(e) => setJksOptions((prev) => ({ ...prev, alias: e.target.value }))}
                />
              </FormControl>
            </>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline_bg"
              onClick={() => handlePopUpToggle("certificateExport", false)}
            >
              Cancel
            </Button>
            <Button
              colorSchema="primary"
              leftIcon={<FontAwesomeIcon icon={faDownload} />}
              onClick={handleExport}
              disabled={!serialNumber || !isFormValid()}
            >
              Export {selectedFormat.toUpperCase()}
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};
