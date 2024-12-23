import { useState } from "react";
import { faCopy, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Input, TextArea } from "@app/components/v2";

type SecretFieldProps = {
  value: string;
  onChange: (value: string) => void;
  isError?: boolean;
  type?: "text" | "password" | "textarea";
  placeholder?: string;
  rows?: number;
};

export const SecretField = ({ 
  value, 
  onChange, 
  isError, 
  type = "text",
  placeholder,
  rows
}: SecretFieldProps) => {
  const [isVisible, setIsVisible] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      // Optional: Add a notification that the value was copied
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const inputProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    isError,
    placeholder,
    type: isVisible ? "text" : "password"
  };

  const renderControls = () => {
    if (!value) return null;

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
      {type === "textarea" ? (
        <TextArea {...inputProps} rows={rows} />
      ) : (
        <Input {...inputProps} />
      )}
      {renderControls()}
    </div>
  );
}; 