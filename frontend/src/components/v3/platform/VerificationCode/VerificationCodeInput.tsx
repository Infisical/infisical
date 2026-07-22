/* eslint-disable react/jsx-props-no-spreading */
import ReactCodeInput from "react-code-input";

import { cn } from "../../utils";

const codeInputStyle = {
  inputStyle: {
    fontFamily: "var(--font-mono)",
    margin: "0",
    MozAppearance: "textfield",
    width: "100%",
    borderRadius: "6px",
    fontSize: "20px",
    height: "68px",
    padding: "0",
    backgroundColor: "var(--color-container)",
    color: "var(--color-foreground)",
    border: "1px solid var(--color-border)",
    textAlign: "center",
    outlineColor: "transparent",
    borderColor: "var(--color-border)"
  }
} as const;

type Props = {
  fields?: number;
  isError?: boolean;
  name: string;
  onChange: (value: string) => void;
  value?: string;
};

export const VerificationCodeInput = ({ fields = 6, isError, name, onChange, value }: Props) => (
  <ReactCodeInput
    name={name}
    inputMode={fields === 6 ? "tel" : "latin"}
    type="text"
    fields={fields}
    onChange={onChange}
    value={value}
    {...codeInputStyle}
    className={cn(
      "code-input-v3",
      fields === 8 && "code-input-v3-recovery",
      isError && "code-input-v3-error"
    )}
  />
);
