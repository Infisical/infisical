import { ComponentType } from "react";

import { PamPolicyType } from "@app/hooks/api/pam";

import { BooleanPolicyEditor } from "./BooleanPolicyEditor";
import { DurationPolicyEditor } from "./DurationPolicyEditor";
import { PolicyEditorProps } from "./types";

export const POLICY_EDITORS: Partial<Record<string, ComponentType<PolicyEditorProps>>> = {
  [PamPolicyType.RequireMfa]: BooleanPolicyEditor,
  [PamPolicyType.RequireReason]: BooleanPolicyEditor,
  [PamPolicyType.MaxSessionDuration]: DurationPolicyEditor
};

export type { PolicyEditorProps } from "./types";
