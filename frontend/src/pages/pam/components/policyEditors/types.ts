import { PamAccountType } from "@app/hooks/api/pam";

export type PolicyEditorProps = {
  accountType: PamAccountType;
  label: string;
  description: string;
  value: unknown;
  onChange: (value: unknown) => void;
};
