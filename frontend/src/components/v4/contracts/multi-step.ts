import type { ComponentDefinition } from "./types";

export const multiStepDefinition = {
  id: "multi-step",
  title: "Multi step",
  group: "Composites",
  summary:
    "A task in steps where each step checks its fields before the next, in a dialog, a sheet or the page.",
  sourceFiles: [
    "src/components/v4/ui/multi-step.tsx",
    "src/components/v4/ui/multi-step.module.css"
  ],
  exports: ["MultiStep", "Steps"],
  referenceNames: ["MultiStep", "Steps"],
  behavior: [
    "Each step slides in from the direction of travel while its box eases to the new height; reduced motion jumps.",
    "validate returns true or nothing to continue, false to stay and focus the first invalid field, or a message for the footer. A promise keeps Continue busy.",
    "onComplete runs after the last step validates. A rejection shows its message in the footer.",
    "Moving to a step focuses its first field, and Enter in a text field continues.",
    "The page variant shows a vertical step list beside a card; under 640px the list becomes the step bar above the card."
  ],
  accessibility: [
    "The horizontal indicator is a progressbar with Step 2 of 3 as its value text; the vertical list marks the current step with aria-current.",
    "In the vertical list, earlier steps are buttons that go back to them. Moving forward always runs the step's validate, and the horizontal indicator is not interactive."
  ],
  limitations: [
    "The dialog opens in place; it does not grow out of its trigger.",
    "The host owns field values, so values survive going back.",
    "The dialog and sheet cannot be dismissed while a step is checking; closing them calls onCancel and returns to the first step."
  ],
  examples: [
    {
      id: "default",
      title: "Connect an integration in three containers",
      module: "./examples/multi-step/default.tsx",
      states: ["default", "invalid", "controlled", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "variant",
      expected: ["dialog", "sheet", "page"],
      shown: [
        {
          value: "dialog",
          exampleId: "default",
          label: "dialog"
        },
        {
          value: "sheet",
          exampleId: "default",
          label: "sheet"
        },
        {
          value: "page",
          exampleId: "default",
          label: "page"
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use MultiStep for three to five ordered steps where later steps depend on earlier ones, ending with a review that names the action."
    ],
    avoid: ["Use it for sections people visit in any order, or for a two-step task."],
    decision:
      "Choose MultiStep for ordered, validated steps. Use Tabs for sections in any order and a Dialog with sections for two steps.",
    rules: [
      {
        id: "multi-step-validate",
        when: "A step has required fields.",
        do: "Return false from validate after setting field errors, so focus moves to the first invalid field.",
        avoid: "Advance and report every error on the review step.",
        reason: "Errors are easiest to fix where the value was entered.",
        evidence: [
          "src/components/v4/ui/multi-step.tsx",
          "src/pages/design-system/examples/multi-step/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Press Continue with an empty team slug and check that focus lands on the field."
        }
      },
      {
        id: "multi-step-complete-label",
        when: "The last step runs the task.",
        do: "Name the action in completeLabel, such as Connect or Import 4 secrets.",
        avoid: "Leave the primary as Finish or Submit.",
        reason: "The last button commits the task, so it should say what happens.",
        evidence: ["src/pages/design-system/examples/multi-step/default.tsx"],
        detect: {
          by: "review",
          how: "Read the primary label on the last step."
        }
      }
    ],
    states: [
      {
        state: "invalid",
        guidance: "The step stays and focus moves to the first invalid field."
      },
      {
        state: "busy",
        guidance: "Continue shows its loading state while validate or onComplete runs."
      }
    ],
    antiSlop: [
      {
        do: "Title steps with nouns, such as Team and Review.",
        avoid: "Write steps as sentences or number them in the title.",
        reason: "The indicator already numbers them."
      }
    ]
  },
  checks: [
    {
      kind: "static",
      command: "npm run type:check"
    },
    {
      kind: "browser",
      command:
        "npm run ui:dev; open /design-system#multi-step and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
