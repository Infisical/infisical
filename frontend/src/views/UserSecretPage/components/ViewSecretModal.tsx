import { useState } from "react";
import { faEye, faEyeSlash, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconButton, Modal, ModalContent } from "@app/components/v2";
import { CredentialType } from "@app/hooks/api/userSecret/types";
import { createNotification } from "@app/components/notifications";

type Props = {
  isOpen: boolean;
  data?: any;
  onClose: () => void;
};

export const ViewSecretModal = ({ isOpen, data, onClose }: Props) => {
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});

  const closeModal = () => {
    onClose();
    setVisibleFields({}); // Reset visibility when closing
  };

  const toggleFieldVisibility = (field: string) => {
    setVisibleFields((prev: Record<string, boolean>) => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    createNotification({
      text: "Copied to clipboard",
      type: "success"
    });
  };

  const SecretField = ({ 
    label, 
    value, 
    isSecret = true, 
    isTextArea = false 
  }: { 
    label: string; 
    value?: string; 
    isSecret?: boolean;
    isTextArea?: boolean;
  }) => (
    <div className="flex flex-col gap-2">
      <label className="text-sm text-bunker-300">{label}</label>
      <div className="relative flex items-center gap-2">
        {isTextArea ? (
          <textarea
            value={value || ""}
            readOnly
            className="h-40 min-h-[70px] w-full rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 text-gray-200"
            style={{ 
              fontFamily: isSecret && !visibleFields[label] ? "password" : "inherit",
              WebkitTextSecurity: isSecret && !visibleFields[label] ? "disc" : "none"
            }}
          />
        ) : (
          <input
            type={isSecret && !visibleFields[label] ? "password" : "text"}
            value={value || ""}
            readOnly
            className="w-full rounded-md border border-mineshaft-600 bg-mineshaft-900 px-4 py-2 text-gray-200"
          />
        )}
        {isSecret && (
          <IconButton
            variant="plain"
            type="button"
            onClick={() => toggleFieldVisibility(label)}
            className={`absolute ${isTextArea ? "right-3 top-3" : "right-3"} text-gray-400 hover:text-gray-200`}
          >
            <FontAwesomeIcon icon={visibleFields[label] ? faEyeSlash : faEye} />
          </IconButton>
        )}
        {value && (
          <IconButton
            variant="plain"
            type="button"
            onClick={() => handleCopy(value)}
            className={`absolute ${isTextArea ? "right-10 top-3" : "right-10"} text-gray-400 hover:text-gray-200`}
          >
            <FontAwesomeIcon icon={faCopy} />
          </IconButton>
        )}
      </div>
    </div>
  );

  const renderCredentialFields = (data: any) => {
    if (!data) return null;

    switch (data.type) {
      case CredentialType.WEB_LOGIN:
        return (
          <>
            <SecretField label="Username" value={data.username} isSecret={false} />
            <SecretField label="Password" value={data.password} />
            {data.website && (
              <SecretField label="Website" value={data.website} isSecret={false} />
            )}
          </>
        );

      case CredentialType.CREDIT_CARD:
        return (
          <>
            <SecretField label="Card Number" value={data.cardNumber} />
            <SecretField label="Cardholder Name" value={data.cardholderName} isSecret={false} />
            <SecretField label="Expiry Date" value={data.expiryDate} />
            <SecretField label="CVV" value={data.cvv} />
          </>
        );

      case CredentialType.SECURE_NOTE:
        return (
          <SecretField 
            label="Content" 
            value={data.content}
            isSecret
            isTextArea
          />
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(isOpen: boolean) => {
        if (!isOpen) closeModal();
      }}
    >
      <ModalContent
        title={data?.name}
        subTitle={data?.description}
      >
        <div className="flex flex-col gap-6 p-6">
         

        <div className="flex flex-col gap-4">
          {renderCredentialFields(data)}
        </div>
        </div>
      </ModalContent>
    </Modal>
  );
};