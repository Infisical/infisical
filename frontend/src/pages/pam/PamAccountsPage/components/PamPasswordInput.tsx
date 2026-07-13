import { Input } from "@app/components/v3/generic/Input";
import { TextArea } from "@app/components/v3/generic/TextArea";
import { UNCHANGED_PASSWORD_SENTINEL } from "@app/hooks/api/pam/constants";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isError?: boolean;
  multiline?: boolean;
};

// Write-only secret input: seeded with the "unchanged" sentinel; focusing clears it to ""
export const PamPasswordInput = ({ value, onChange, placeholder, isError, multiline }: Props) => {
  const isUnchanged = value === UNCHANGED_PASSWORD_SENTINEL;

  const handleFocus = () => {
    if (isUnchanged) onChange("");
  };

  if (multiline) {
    return (
      <TextArea
        value={isUnchanged ? "" : value}
        onFocus={handleFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isUnchanged ? "Unchanged, click to replace" : placeholder}
        rows={4}
        className="font-mono text-xs"
        isError={isError}
      />
    );
  }

  return (
    <Input
      type="password"
      value={value}
      onFocus={handleFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      isError={isError}
    />
  );
};
