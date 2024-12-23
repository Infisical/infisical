import { useState } from "react";
import { faCopy, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Input } from "@app/components/v2";

import { createNotification } from "../notifications";

type HideableFieldProps = {
  value: string;
  onChange: (value: string) => void;
  isError?: boolean;
  placeholder?: string;
  isSecret?: boolean;
};

export const HideableField = ({ 
  value, 
  onChange, 
  isError, 
  placeholder,
  isSecret = false,
}: HideableFieldProps) => {
  const [isVisible, setIsVisible] = useState(!isSecret);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      createNotification({
        type: "success",
        text: "Copied to clipboard"
      });
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const inputProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    isError,
    placeholder,
    type: (isSecret && !isVisible) ? "password" : "text"
  };

  const renderControls = () => {
    if (!value || !isSecret) return null;

    return (
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2">
        <button
          type="button"
          onClick={() => setIsVisible(!isVisible)}
          className="text-mineshaft-300 hover:text-mineshaft-100"
        >
          <FontAwesomeIcon icon={isVisible ? faEyeSlash : faEye} />
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="text-mineshaft-300 hover:text-mineshaft-100"
        >
          <FontAwesomeIcon icon={faCopy} />
        </button>
      </div>
    );
  };

  return (
    <div className="relative">
      <Input {...inputProps} />
      {renderControls()}
    </div>
  );
}; 