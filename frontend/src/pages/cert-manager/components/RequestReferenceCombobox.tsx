import { useRef } from "react";

import { Combobox } from "@app/components/v3";
import { isLiteralSanValue } from "@app/pages/cert-manager/CertificatesPage/components/certificateUtils";
import {
  formatRequestReferenceValue,
  isRequestReference,
  REQUEST_REFERENCES
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

type TRequestReferenceOption = { value: string; label: string };

const REQUEST_REFERENCE_OPTIONS: TRequestReferenceOption[] = Object.entries(REQUEST_REFERENCES).map(
  ([value, reference]) => ({ value, label: reference.label })
);

const UNKNOWN_REFERENCE_HINT = `Only ${REQUEST_REFERENCE_OPTIONS.map(({ label }) => `"${label}"`).join(", ")} is supported`;

const isTypedValueAllowed = (inputValue: string) =>
  isLiteralSanValue(inputValue) || isRequestReference(inputValue);

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  referenceHint?: string;
  "aria-label"?: string;
};

export const RequestReferenceCombobox = ({
  value,
  onChange,
  placeholder,
  referenceHint,
  "aria-label": ariaLabel
}: Props) => {
  const typedValueRef = useRef<string | null>(null);
  const typedBeforeCloseRef = useRef<string | null>(null);

  const commitTypedValueOnClose = (isOpen: boolean) => {
    if (isOpen) return;
    const typedValue = typedBeforeCloseRef.current?.trim();
    typedValueRef.current = null;
    typedBeforeCloseRef.current = null;
    if (typedValue === undefined) return;
    const matchingOption = REQUEST_REFERENCE_OPTIONS.find(
      (option) => option.label.toLowerCase() === typedValue.toLowerCase()
    );
    if (matchingOption) onChange(matchingOption.value);
    else if (typedValue === "" || isTypedValueAllowed(typedValue)) onChange(typedValue);
  };

  return (
    <div className="min-w-0 flex-1">
      <Combobox
        aria-label={ariaLabel}
        title={value ? formatRequestReferenceValue(value) : undefined}
        options={REQUEST_REFERENCE_OPTIONS}
        value={value ? { value, label: formatRequestReferenceValue(value) } : null}
        onValueChange={(option) => {
          typedValueRef.current = null;
          onChange(option?.value ?? "");
        }}
        onInputValueChange={(inputValue) => {
          typedBeforeCloseRef.current = typedValueRef.current;
          typedValueRef.current = inputValue;
        }}
        onPopupOpenChange={commitTypedValueOnClose}
        onKeyDown={(event) => {
          if (event.key === "Escape") typedValueRef.current = null;
        }}
        creation={{
          onCreate: (inputValue) => {
            typedValueRef.current = null;
            onChange(inputValue.trim());
          },
          isValid: isTypedValueAllowed,
          isDuplicate: (inputValue, option) =>
            inputValue === option.value || inputValue === option.label,
          formatLabel: (inputValue) =>
            isTypedValueAllowed(inputValue.trim()) ? `Use "${inputValue}"` : UNKNOWN_REFERENCE_HINT,
          emptyLabel: "Type a value"
        }}
        getOptionValue={(option) => option.value}
        getOptionLabel={(option) => option.label}
        getOptionKeywords={(option) => [option.value]}
        renderOption={(option) => (
          <div className="min-w-0">
            <p className="truncate">{option.label}</p>
            {isRequestReference(option.value) && (
              <p className="truncate text-xs text-muted">
                {REQUEST_REFERENCES[option.value].description}
              </p>
            )}
          </div>
        )}
        placeholder={placeholder}
        contentClassName="min-w-72"
      />
      {referenceHint && isRequestReference(value) && (
        <p className="mt-1 text-xs text-muted">{referenceHint}</p>
      )}
    </div>
  );
};
