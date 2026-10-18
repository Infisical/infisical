export type ComponentGroup =
  | "Actions"
  | "Forms"
  | "Data display"
  | "Navigation"
  | "Overlays"
  | "Composites"
  | "Patterns"
  | "Feedback"
  | "Code"
  | "Utilities";

export type ExampleState =
  | "default"
  | "disabled"
  | "invalid"
  | "loading"
  | "empty"
  | "controlled"
  | "keyboard"
  | "overflow"
  | "error"
  | "success"
  | "read-only"
  | "editing";

/**
 * Who catches a broken rule. `lint` names a check in scripts/check-v4.ts, which must name this rule
 * back; `test` names a test file that exercises it; `review` means only a person or agent reading the
 * diff will notice, and `how` says what they look for.
 */
export type RuleDetect =
  | { by: "lint"; check: string }
  | { by: "test"; test: string; how: string }
  | { by: "review"; how?: string };

export interface ComponentExampleDefinition {
  id: string;
  title: string;
  module: `./examples/${string}/${string}.tsx`;
  states: readonly ExampleState[];
}

export interface ComponentDefinition {
  id: string;
  title: string;
  group: ComponentGroup;
  summary: string;
  sourceFiles: readonly string[];
  exports: readonly string[];
  referenceNames: readonly string[];
  behavior: readonly string[];
  accessibility: readonly string[];
  limitations: readonly string[];
  related?: readonly string[];
  examples: readonly ComponentExampleDefinition[];
  coverage?: readonly {
    axis: string;
    /** data-slot carrying a root prop when the root renders no element of its own. */
    slot?: string;
    expected: readonly string[];
    shown: readonly {
      value: string;
      exampleId: string;
      label: string;
      aliasOf?: string;
    }[];
    omitted?: readonly { value: string; reason: string }[];
  }[];
  guidance: {
    use: readonly string[];
    avoid: readonly string[];
    /** Choose this family over its closest alternatives. */
    decision: string;
    rules: readonly {
      id: string;
      when: string;
      do: string;
      avoid: string;
      reason: string;
      evidence: readonly string[];
      detect: RuleDetect;
    }[];
    states: readonly { state: string; guidance: string }[];
    antiSlop: readonly { do: string; avoid: string; reason: string }[];
  };
  checks: readonly {
    kind: "static" | "runtime" | "browser" | "installation";
    command: string;
  }[];
}
