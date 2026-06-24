import { ComponentType } from "react";

import { PamPolicyType } from "@app/hooks/api/pam";

import { BooleanPolicyEditor } from "./BooleanPolicyEditor";
import { DurationPolicyEditor } from "./DurationPolicyEditor";
import { TextAreaPolicyEditor } from "./TextAreaPolicyEditor";
import { PolicyEditorProps } from "./types";

export const POLICY_EDITORS: Partial<Record<PamPolicyType, ComponentType<PolicyEditorProps>>> = {
  [PamPolicyType.RequireMfa]: BooleanPolicyEditor,
  [PamPolicyType.RequireReason]: BooleanPolicyEditor,
  [PamPolicyType.MaxSessionDuration]: DurationPolicyEditor,
  [PamPolicyType.CommandBlocking]: TextAreaPolicyEditor
};

export type { PolicyEditorProps } from "./types";
