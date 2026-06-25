import { ComponentType } from "react";

import { PamPolicyType } from "@app/hooks/api/pam";

import { BooleanPolicyEditor } from "./BooleanPolicyEditor";
import { DurationPolicyEditor } from "./DurationPolicyEditor";
import { TextAreaPolicyEditor } from "./TextAreaPolicyEditor";
import { PolicyEditorProps } from "./types";

const DEFAULT_PATTERN_PLACEHOLDER = "rm\\s+-rf.*\npassword\\s*=\\s*\\S+\n\\b\\d{3}-\\d{2}-\\d{4}\\b";

const CommandBlockingEditor = (props: PolicyEditorProps) => (
  <TextAreaPolicyEditor {...props} placeholder={DEFAULT_PATTERN_PLACEHOLDER} />
);

export const POLICY_EDITORS: Partial<Record<PamPolicyType, ComponentType<PolicyEditorProps>>> = {
  [PamPolicyType.RequireMfa]: BooleanPolicyEditor,
  [PamPolicyType.RequireReason]: BooleanPolicyEditor,
  [PamPolicyType.MaxSessionDuration]: DurationPolicyEditor,
  [PamPolicyType.CommandBlocking]: CommandBlockingEditor
};

export type { PolicyEditorProps } from "./types";
