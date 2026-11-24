import { useRef } from "react";

import { Combobox, FieldError } from "@app/components/v3";
import {
  isSupportedSanRuleValue,
  UNSUPPORTED_REFERENCE_MESSAGE
} from "@app/pages/cert-manager/CertificatesPage/components/certificateUtils";
import {
  COMMON_NAME_REFERENCE_DESCRIPTION,
  COMMON_NAME_REFERENCE_LABEL,
  CertRequestReference,
  formatRequestReferenceValue,
  isRequestReference
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

type TRequestReferenceOption = { value: string; label: string };

const REQUEST_REFERENCE_OPTIONS: TRequestReferenceOption[] = [
  { value: CertRequestReference.COMMON_NAME, label: COMMON_NAME_REFERENCE_LABEL }
];

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
  const isClearedByUserRef = useRef(false);

  const commitClear = () => {
    if (!isClearedByUserRef.current) return false;
    isClearedByUserRef.current = false;
    typedValueRef.current = null;
    typedBeforeCloseRef.current = null;
    if (value) onChange("");
    return true;
  };

  const commitTypedValueOnClose = (isOpen: boolean) => {
    if (isOpen || commitClear()) return;
    const typedValue = typedBeforeCloseRef.current?.trim();
    typedValueRef.current = null;
    typedBeforeCloseRef.current = null;
    if (typedValue === undefined) return;
    const matchingOption = REQUEST_REFERENCE_OPTIONS.find(
      (option) => option.label.toLowerCase() === typedValue.toLowerCase()
    );
    onChange(matchingOption ? matchingOption.value : typedValue);
  };

  return (
    <div className="min-w-0 flex-1">
      <Combobox
        aria-label={ariaLabel}
        isError={!isSupportedSanRuleValue(value)}
        title={value ? formatRequestReferenceValue(value) : undefined}
        options={REQUEST_REFERENCE_OPTIONS}
        value={value ? { value, label: formatRequestReferenceValue(value) } : null}
        onValueChange={(option) => {
          typedValueRef.current = null;
          isClearedByUserRef.current = false;
          onChange(option?.value ?? "");
        }}
        onInputValueChange={(inputValue) => {
          typedBeforeCloseRef.current = typedValueRef.current;
          typedValueRef.current = inputValue;
        }}
        onPopupOpenChange={commitTypedValueOnClose}
        onKeyUp={(event) => {
          isClearedByUserRef.current =
            event.target instanceof HTMLInputElement && !event.target.value.trim();
        }}
        onBlur={commitClear}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          typedValueRef.current = null;
          isClearedByUserRef.current = false;
        }}
        creation={{
          onCreate: (inputValue) => {
            typedValueRef.current = null;
            onChange(inputValue.trim());
          },
          isValid: isSupportedSanRuleValue,
          isDuplicate: (inputValue, option) =>
            inputValue === option.value || inputValue === option.label,
          formatLabel: (inputValue) =>
            isSupportedSanRuleValue(inputValue.trim())
              ? `Use "${inputValue}"`
              : UNSUPPORTED_REFERENCE_MESSAGE,
          emptyLabel: "Type a value"
        }}
        getOptionValue={(option) => option.value}
        getOptionLabel={(option) => option.label}
        getOptionKeywords={(option) => [option.value]}
        renderOption={(option) => (
          <div className="min-w-0">
            <p className="truncate">{option.label}</p>
            {isRequestReference(option.value) && (
              <p className="truncate text-xs text-muted">{COMMON_NAME_REFERENCE_DESCRIPTION}</p>
            )}
          </div>
        )}
        placeholder={placeholder}
        contentClassName="min-w-72"
      />
      {referenceHint && isRequestReference(value) && (
        <p className="mt-1 text-xs text-muted">{referenceHint}</p>
      )}
      <FieldError className="mt-1">
        {isSupportedSanRuleValue(value) ? undefined : UNSUPPORTED_REFERENCE_MESSAGE}
      </FieldError>
    </div>
  );
};
