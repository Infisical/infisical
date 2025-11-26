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
  onFormatSelected: (
    format: "pem" | "pkcs12",
    {
      certificateId,
      serialNumber
    }: {
      certificateId: string;
      serialNumber: string;
    },
    options?: ExportOptions
  ) => void;
};

export type CertificateExportFormat = "pem" | "pkcs12";

export type ExportOptions = {
  pkcs12?: {
    password: string;
    alias: string;
  };
};

export const CertificateExportModal = ({ popUp, handlePopUpToggle, onFormatSelected }: Props) => {
  const [selectedFormat, setSelectedFormat] = useState<CertificateExportFormat>("pem");
  const [pkcs12Options, setPkcs12Options] = useState({
    password: "",
    alias: ""
  });

  const { certificateId, serialNumber } =
    (popUp?.certificateExport?.data as {
      certificateId: string;
      serialNumber: string;
    }) || {};

  // Reset form whenever the modal opens
  useEffect(() => {
    if (popUp?.certificateExport?.isOpen) {
      setSelectedFormat("pem");
      setPkcs12Options({
        password: "",
        alias: ""
      });
    }
  }, [popUp?.certificateExport?.isOpen]);

  const isFormValid = () => {
    if (selectedFormat === "pkcs12") {
      return pkcs12Options.password.length >= 6 && pkcs12Options.alias.trim() !== "";
    }
    return true;
  };

  const handleExport = () => {
    if ((certificateId || serialNumber) && isFormValid()) {
      const options: ExportOptions = {};

      if (selectedFormat === "pkcs12") {
        options.pkcs12 = pkcs12Options;
      }

      onFormatSelected(
        selectedFormat,
        {
          certificateId,
          serialNumber
        },
        options
      );
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
              <SelectItem value="pkcs12">PKCS12 Format</SelectItem>
            </Select>
          </FormControl>

          {selectedFormat === "pkcs12" && (
            <>
              <FormControl
                label="Keystore Password"
                helperText={
                  pkcs12Options.password.length > 0 && pkcs12Options.password.length < 6
                    ? undefined
                    : "Password to protect the PKCS12 keystore (minimum 6 characters)"
                }
                isError={pkcs12Options.password.length > 0 && pkcs12Options.password.length < 6}
                errorText="Password must be at least 6 characters long"
              >
                <Input
                  placeholder="Enter keystore password"
                  value={pkcs12Options.password}
                  onChange={(e) =>
                    setPkcs12Options((prev) => ({ ...prev, password: e.target.value }))
                  }
                  type="password"
                />
              </FormControl>

              <FormControl
                label="Certificate Alias"
                helperText="Friendly name for the certificate in the keystore"
              >
                <Input
                  placeholder="Enter certificate alias"
                  value={pkcs12Options.alias}
                  onChange={(e) => setPkcs12Options((prev) => ({ ...prev, alias: e.target.value }))}
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
              disabled={!(certificateId || serialNumber) || !isFormValid()}
            >
              Export {selectedFormat.toUpperCase()}
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};
