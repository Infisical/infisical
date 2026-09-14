import { ComponentType } from "react";

import { PamAccountType, PamPolicyType } from "@app/hooks/api/pam";

import { BooleanPolicyEditor } from "./BooleanPolicyEditor";
import { DurationPolicyEditor } from "./DurationPolicyEditor";
import { TextAreaPolicyEditor } from "./TextAreaPolicyEditor";
import { PolicyEditorProps } from "./types";

const DEFAULT_PATTERN_PLACEHOLDER =
  "rm\\s+-rf.*\npassword\\s*=\\s*\\S+\n\\b\\d{3}-\\d{2}-\\d{4}\\b";

const SQL_PATTERN_PLACEHOLDER = "^\\s*drop\\b\n\\btruncate\\b\n^\\s*grant\\b";

const COMMAND_BLOCKING_PLACEHOLDERS: Partial<Record<PamAccountType, string>> = {
  [PamAccountType.Snowflake]: SQL_PATTERN_PLACEHOLDER
};

const CommandBlockingEditor = ({ accountType, ...props }: PolicyEditorProps) => (
  <TextAreaPolicyEditor
    {...props}
    accountType={accountType}
    placeholder={COMMAND_BLOCKING_PLACEHOLDERS[accountType] ?? DEFAULT_PATTERN_PLACEHOLDER}
  />
);

export const POLICY_EDITORS: Partial<Record<PamPolicyType, ComponentType<PolicyEditorProps>>> = {
  [PamPolicyType.RequiresApproval]: BooleanPolicyEditor,
  [PamPolicyType.AllowBreakGlass]: BooleanPolicyEditor,
  [PamPolicyType.RequireMfa]: BooleanPolicyEditor,
  [PamPolicyType.RequireReason]: BooleanPolicyEditor,
  [PamPolicyType.MaxSessionDuration]: DurationPolicyEditor,
  [PamPolicyType.CommandBlocking]: CommandBlockingEditor
};

export type { PolicyEditorProps } from "./types";
