import type { ComponentDefinition } from "./types";

export const baselineForms = [
  {
    id: "checkbox",
    title: "Checkbox",
    group: "Forms",
    summary: "Stage an independent choice, including a mixed selection state.",
    sourceFiles: ["src/components/v4/ui/checkbox.tsx"],
    exports: ["Checkbox"],
    referenceNames: ["Checkbox"],
    behavior: [
      "Checkbox supports checked, unchecked and mixed values, labeled content and disabled policy states. The owner applies or stages its checked change."
    ],
    accessibility: ["Name the control. Screen readers announce the mixed state."],
    limitations: [
      "onCheckedChange can report indeterminate; the convenience onChange maps only true to true. The owner computes aggregate mixed state."
    ],
    examples: [
      {
        id: "default",
        title: "Controlled environment selection",
        module: "./examples/checkbox/default.tsx",
        states: ["controlled", "keyboard"]
      },
      {
        id: "states",
        title: "States",
        module: "./examples/checkbox/states.tsx",
        states: ["default", "disabled", "invalid"]
      }
    ],
    coverage: [
      {
        axis: "state",
        expected: [
          "unchecked",
          "checked",
          "indeterminate",
          "disabled",
          "invalid",
          "label and description",
          "controlled mixed parent",
          "policy selection",
          "long label"
        ],
        omitted: [
          {
            value: "invalid",
            reason: "aria-invalid draws the red control border; Field shows the error rendering."
          },
          {
            value: "long label",
            reason:
              "A stress case: a long label wraps beside the box, which stays top-aligned with the first line."
          }
        ],
        shown: [
          {
            value: "unchecked",
            exampleId: "states",
            label: "Off"
          },
          {
            value: "checked",
            exampleId: "states",
            label: "On"
          },
          {
            value: "indeterminate",
            exampleId: "states",
            label: "Mixed"
          },
          {
            value: "disabled",
            exampleId: "states",
            label: "Disabled"
          },
          {
            value: "label and description",
            exampleId: "default",
            label: "Audit environment"
          },
          {
            value: "controlled mixed parent",
            exampleId: "default",
            label: "Select available environments"
          },
          {
            value: "policy selection",
            exampleId: "default",
            label: "Audit environment"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Compute checked and indeterminate from the actual eligible children, preserve policy-disabled selections and stage the boolean when a later Save applies it."
      ],
      avoid: [
        "Treat indeterminate as true, count locked rows as selectable or use a Switch for a staged draft."
      ],
      decision:
        "Choose Checkbox for a staged independent choice or parent selection. Use RadioGroup for exactly one value and Switch for an immediately applied setting.",
      rules: [
        {
          id: "checkbox-usage",
          when: "A parent represents a subset of selected eligible rows.",
          do: "Show mixed when some children are selected and let the host compute checked state from the actual children.",
          avoid:
            "Treat mixed as checked or submit the checkbox's display string as permission truth.",
          reason:
            "The parent summarizes selection; it cannot establish authorization or prove every child is included.",
          evidence: [
            "src/components/v4/ui/checkbox.tsx",
            "src/pages/design-system/examples/checkbox/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Select one child, then all eligible children, then clear them; the parent changes mixed/checked/unchecked and locked children retain their actual state."
          }
        }
      ],
      states: [
        {
          state: "mixed",
          guidance: "Keep the parent label stable and expose indeterminate state."
        },
        {
          state: "disabled",
          guidance: "Retain the reason an option cannot be selected beside the choice."
        }
      ],
      antiSlop: [
        {
          do: "Describe the choice in a visible sentence or noun phrase.",
          avoid: "Use a standalone tiny checkbox as an unexplained decorative selection marker.",
          reason: "People need to know what checking it will include."
        },
        {
          do: "Keep checked, unchecked, mixed and policy-controlled choices inspectable with their visible labels.",
          avoid:
            "Count a disabled policy selection as an editable choice or put the only reason inside an unreachable control.",
          reason:
            "People need to distinguish their draft changes from selections the host requires."
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
          "npm run ui:dev; open /design-system#checkbox and verify the documented interaction."
      }
    ]
  },
  {
    id: "field",
    title: "Field",
    group: "Forms",
    summary: "Connect a control to its label, description and validation error.",
    sourceFiles: ["src/components/v4/ui/field.tsx"],
    exports: [
      "Field",
      "FieldContent",
      "FieldDescription",
      "FieldError",
      "FieldGroup",
      "FieldLabel",
      "FieldLegend",
      "FieldSeparator",
      "FieldSet",
      "FieldTitle"
    ],
    referenceNames: ["Field"],
    behavior: [
      "Use label/description/error shorthand around one control for automatic ID, label, described-by and invalid-state association. Compound FieldLabel/FieldDescription/FieldError parts remain available for custom layouts. An error renders one way everywhere: a red alert icon and the message, several messages stacked under one icon. The label stays ink; the control's red border and the message carry the error. The label sits 6px above the control (the field-label space token)."
    ],
    accessibility: [
      "The short form connects the label, help and error to a single control. In a compound layout, match htmlFor to the control's id and point aria-describedby at the help and error. Grouped controls take a group with a legend."
    ],
    limitations: [
      "Automatic association is limited to controls consuming Field context. Custom controls and compound parts need explicit IDs and ARIA wiring; validation is host-owned."
    ],
    examples: [
      {
        id: "default",
        title: "Labels and errors",
        module: "./examples/field/default.tsx",
        states: ["default", "invalid"]
      },
      {
        id: "layouts",
        title: "Layouts",
        module: "./examples/field/layouts.tsx",
        states: ["default"]
      },
      {
        id: "grouping",
        title: "Grouped fields",
        module: "./examples/field/grouping.tsx",
        states: ["default", "invalid"]
      }
    ],
    coverage: [
      {
        axis: "orientation",
        expected: ["vertical", "horizontal", "responsive"],
        shown: [
          {
            value: "vertical",
            exampleId: "layouts",
            label: "vertical"
          },
          {
            value: "horizontal",
            exampleId: "layouts",
            label: "horizontal"
          }
        ],
        omitted: [
          {
            value: "responsive",
            reason:
              "Vertical below the field group's md container width and horizontal above it. At this page width it is identical to horizontal."
          }
        ]
      },
      {
        axis: "FieldLegend.variant",
        expected: ["legend", "label"],
        shown: [
          {
            value: "legend",
            exampleId: "grouping",
            label: "legend"
          }
        ],
        omitted: [
          {
            value: "label",
            reason:
              "A legend set in the field-label type instead of the section title, for a short group inside a form. Same element and association as legend."
          }
        ]
      },
      {
        axis: "composition",
        expected: [
          "automatic association",
          "explicit association",
          "optional",
          "group",
          "separator",
          "multiple errors",
          "legend",
          "label legend"
        ],
        shown: [
          {
            value: "automatic association",
            exampleId: "default",
            label: "Connection name"
          },
          {
            value: "explicit association",
            exampleId: "default",
            label: "Project name"
          },
          {
            value: "optional",
            exampleId: "grouping",
            label: "Description (optional)"
          },
          {
            value: "group",
            exampleId: "grouping",
            label: "Notifications"
          },
          {
            value: "separator",
            exampleId: "grouping",
            label: "Ownership"
          },
          {
            value: "multiple errors",
            exampleId: "grouping",
            label: "Enter a change reason."
          },
          {
            value: "legend",
            exampleId: "grouping",
            label: "Service ownership"
          }
        ],
        omitted: [
          {
            value: "label legend",
            reason: 'FieldLegend variant="label"; see the FieldLegend.variant axis.'
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use vertical, horizontal or responsive Field composition to keep a value's visible name, help and correction together."
      ],
      avoid: [],
      decision:
        "Choose Field to connect a control with its label, help and error. Use FieldSet and FieldLegend for a group rather than assigning one label to several controls.",
      rules: [
        {
          id: "field-usage",
          when: "A control fails validation after submission.",
          do: "Keep the entered value, associate the field-specific error with the focusable control and explain the repair without repeating the label.",
          avoid:
            "Put an error beside an unlabeled wrapper or show unrelated help and error as competing instructions.",
          reason:
            "The person needs one clear repair instruction attached to the value they can change, not repeated helper copy competing with the error.",
          evidence: [
            "src/components/v4/ui/field.tsx",
            "src/pages/design-system/examples/field/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Activate each visible label and inspect the focused control's accessible description. Its own help/error is associated, and entered values survive invalid submission."
          }
        },
        {
          id: "field-association-and-validation",
          when: "A form control has a label, help and validation error.",
          do: "Use Field for supported automatic association, or connect explicit ids and ARIA descriptions for custom and compound controls; keep the label visible.",
          avoid:
            "Assume every child consumes Field context, use placeholder text as the label or show an invalid color with no associated explanation.",
          reason:
            "Visual proximity does not create an accessible label or tell the person how to correct the value.",
          detect: {
            by: "review",
            how: "Focus each control with an error and inspect its name and description associations. The visible error is reachable, and custom controls retain explicit wiring."
          },
          evidence: [
            "src/components/v4/ui/field.tsx",
            "src/pages/design-system/examples/field/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "optional",
          guidance: "Mark optionality in the label area without replacing the control name."
        },
        {
          state: "invalid",
          guidance: "Retain the entered value and use an actionable field-specific error."
        }
      ],
      antiSlop: [
        {
          do: "Write help only when it changes how a person fills the field.",
          avoid: "Repeat the label as placeholder, description and tooltip.",
          reason: "Repeated copy creates noise without adding a constraint or example."
        },
        {
          do: "Associate each error with the editable control and preserve exact values while repairing it.",
          avoid:
            "Replace task-specific errors with a generic invalid badge or normalize a machine identifier in help text.",
          reason: "The person must be able to locate the value and understand what can repair it."
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
        command: "npm run ui:dev; open /design-system#field and verify the documented interaction."
      }
    ]
  },
  {
    id: "input",
    title: "Input",
    group: "Forms",
    summary: "Enter a single-line value with native input behavior.",
    sourceFiles: ["src/components/v4/ui/input.tsx"],
    exports: ["Input"],
    referenceNames: ["Input"],
    behavior: [
      "Input forwards its native ref and supports sm/md/lg at 32/36/40px, defaulting to sm32, with icon, mono, a read-only lock and trailing content while retaining native editing. A native numeric size is a width hint and retains the default 32px density."
    ],
    accessibility: [
      "Associate a label using Field or explicit htmlFor/id; use readOnly when the value must remain selectable."
    ],
    limitations: [
      "Input keeps native input types and callbacks; formatting, validation and persistence belong to the host. Use Textarea for multiple lines."
    ],
    examples: [
      {
        id: "default",
        title: "States",
        module: "./examples/input/default.tsx",
        states: ["default", "disabled", "invalid", "read-only", "empty"]
      },
      {
        id: "sizes",
        title: "Sizes",
        module: "./examples/input/sizes.tsx",
        states: ["default"]
      },
      {
        id: "editing",
        title: "Controlled editing",
        module: "./examples/input/editing.tsx",
        states: ["controlled", "keyboard"]
      }
    ],
    coverage: [
      {
        axis: "size",
        expected: ["sm", "md", "lg"],
        shown: [
          {
            value: "sm",
            exampleId: "sizes",
            label: "sm"
          },
          {
            value: "md",
            exampleId: "sizes",
            label: "md"
          },
          {
            value: "lg",
            exampleId: "sizes",
            label: "lg"
          }
        ]
      },
      {
        axis: "composition",
        expected: ["leading and trailing", "keyboard suffix", "native numeric hint"],
        shown: [
          {
            value: "leading and trailing",
            exampleId: "editing",
            label: "Draft path"
          },
          {
            value: "keyboard suffix",
            exampleId: "editing",
            label: "Draft path"
          },
          {
            value: "native numeric hint",
            exampleId: "editing",
            label: "Native width hint"
          }
        ]
      },
      {
        axis: "state",
        expected: ["empty", "read-only", "disabled", "invalid", "controlled"],
        shown: [
          {
            value: "empty",
            exampleId: "default",
            label: "Empty name"
          },
          {
            value: "read-only",
            exampleId: "default",
            label: "Managed account"
          },
          {
            value: "disabled",
            exampleId: "default",
            label: "Unavailable setting"
          },
          {
            value: "invalid",
            exampleId: "default",
            label: "Environment slug"
          },
          {
            value: "controlled",
            exampleId: "editing",
            label: "Draft path"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Choose sm, md or lg for one-line editing. Use supported icon and trailing slots, and mono only for a technical value."
      ],
      avoid: [],
      decision:
        "Choose Input for a single-line value with native editing. Use Textarea for multiple lines and SensitiveEditor when stored secret retrieval must be deferred.",
      rules: [
        {
          id: "input-usage",
          when: "A value is readable and copyable but cannot be edited.",
          do: "Use readOnly and retain a visible label and selectable value.",
          avoid:
            "Disable the field solely to prevent editing when the task still requires copying.",
          reason: "Disabled controls cannot receive focus and can block ordinary selection.",
          evidence: [
            "src/components/v4/ui/input.tsx",
            "src/pages/design-system/examples/input/default.tsx",
            "src/pages/design-system/examples/input/editing.tsx"
          ],
          detect: {
            by: "review",
            how: "Edit, copy a read-only value and submit an invalid draft. The field keeps its persistent name and exact value; readonly does not accidentally become disabled."
          }
        },
        {
          id: "input-value-and-affordances",
          when: "A one-line value includes an icon, suffix or trailing control.",
          do: "Use Input's supported size, mono, icon and trailing options, preserve a visible label and keep read-only distinct from disabled.",
          avoid:
            "Pad the input locally to fit a suffix, register a shortcut only by setting kbd or format an exact identifier on every keystroke.",
          reason:
            "The owned slots prevent collisions; displayed affordances do not implement shortcuts or value transformations.",
          detect: {
            by: "review",
            how: "Type a long value beside a long suffix, then test read-only, invalid and disabled states. Text and trailing controls stay separate and the original value is preserved."
          },
          evidence: [
            "src/components/v4/ui/input.tsx",
            "src/pages/design-system/examples/input/default.tsx",
            "src/pages/design-system/examples/input/editing.tsx"
          ]
        }
      ],
      states: [
        {
          state: "invalid",
          guidance: "Retain the draft and associate the error with the input."
        },
        {
          state: "empty",
          guidance: "Use an example placeholder only after supplying a persistent visible label."
        }
      ],
      antiSlop: [
        {
          do: "Choose a width that reflects the expected value.",
          avoid:
            "Stretch a two-digit field across the page or squeeze a resource path into a tiny box.",
          reason: "Field measure communicates the expected input and affects review accuracy."
        },
        {
          do: "Compare density with the same value, and include empty, long exact-value and read-only cases.",
          avoid:
            "Treat the native numeric size hint as another density or only test friendly short names.",
          reason:
            "Geometry and editing behavior are different contracts, and long identifiers expose hidden padding mistakes."
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
        command: "npm run ui:dev; open /design-system#input and verify the documented interaction."
      }
    ]
  },
  {
    id: "input-group",
    title: "Input Group",
    group: "Forms",
    summary: "Compose a text input with leading and trailing controls.",
    sourceFiles: ["src/components/v4/ui/input-group.tsx"],
    exports: [
      "InputGroup",
      "InputGroupAddon",
      "InputGroupButton",
      "InputGroupInput",
      "InputGroupText",
      "InputGroupTextarea"
    ],
    referenceNames: ["InputGroup"],
    behavior: [
      "The default host is sm32; explicit md36 and lg40 retain 24/28/32px nested action slots. Nested buttons fit the host slot even when a larger standalone size is requested.",
      "InputGroup supports sm/md/lg, joined addons and actions, plus Field association. Addons do not become a second input."
    ],
    accessibility: [
      "Keep one named editable control in each input group. Action buttons need separate names."
    ],
    limitations: [
      "Addon click-to-focus ignores nested interactive controls; it does not register keyboard shortcuts or write to the clipboard."
    ],
    examples: [
      {
        id: "default",
        title: "States and clearing",
        module: "./examples/input-group/default.tsx",
        states: ["default", "controlled", "invalid", "disabled", "read-only"]
      },
      {
        id: "sizes",
        title: "Sizes",
        module: "./examples/input-group/sizes.tsx",
        states: ["default"]
      },
      {
        id: "addons",
        title: "Addon placement",
        module: "./examples/input-group/addons.tsx",
        states: ["default"]
      },
      {
        id: "buttons",
        title: "Action recipes",
        module: "./examples/input-group/buttons.tsx",
        states: ["default", "controlled"]
      }
    ],
    coverage: [
      {
        axis: "size",
        expected: ["sm", "md", "lg"],
        shown: [
          {
            value: "sm",
            exampleId: "sizes",
            label: "sm"
          },
          {
            value: "md",
            exampleId: "sizes",
            label: "md"
          },
          {
            value: "lg",
            exampleId: "sizes",
            label: "lg"
          }
        ]
      },
      {
        axis: "InputGroupAddon.align",
        expected: ["inline-start", "inline-end", "block-start", "block-end"],
        shown: [
          {
            value: "inline-start",
            exampleId: "addons",
            label: "inline-start"
          },
          {
            value: "inline-end",
            exampleId: "addons",
            label: "inline-end"
          },
          {
            value: "block-start",
            exampleId: "addons",
            label: "block-start"
          },
          {
            value: "block-end",
            exampleId: "addons",
            label: "block-end"
          }
        ]
      },
      {
        axis: "InputGroupButton.size",
        expected: ["xs", "sm", "icon-xs", "icon-sm"],
        shown: [
          {
            value: "xs",
            exampleId: "buttons",
            label: "xs"
          },
          {
            value: "sm",
            exampleId: "buttons",
            label: "sm"
          },
          {
            value: "icon-xs",
            exampleId: "buttons",
            label: "icon-xs"
          },
          {
            value: "icon-sm",
            exampleId: "buttons",
            label: "icon-sm"
          }
        ]
      },
      {
        axis: "state",
        expected: ["invalid root", "read-only", "disabled", "controlled clear"],
        shown: [
          {
            value: "invalid root",
            exampleId: "default",
            label: "Required path"
          },
          {
            value: "read-only",
            exampleId: "default",
            label: "Managed path"
          },
          {
            value: "disabled",
            exampleId: "default",
            label: "Unavailable path"
          },
          {
            value: "controlled clear",
            exampleId: "default",
            label: "Filter secrets"
          }
        ]
      },
      {
        axis: "composition",
        expected: ["textarea"],
        shown: [
          {
            value: "textarea",
            exampleId: "addons",
            label: "block-start"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Build compound fields from the shared control, addon and action parts instead of assembling another independently styled field."
      ],
      avoid: [],
      decision:
        "Choose InputGroup when one value has a prefix, suffix or adjacent tool. Use FieldGroup for several independent values.",
      rules: [
        {
          id: "input-group-usage",
          when: "A URL field has a scheme prefix and a clear action.",
          do: "Keep one editable input, make the prefix part of the visible context, and name the clear button.",
          avoid:
            "Put a second editable value inside an addon or make the prefix look editable when it is not.",
          reason: "The group should still describe one value with one label and error.",
          evidence: [
            "src/components/v4/ui/input-group.tsx",
            "src/pages/design-system/examples/input-group/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Name and operate the group with keyboard only. There is one intended editable value, and prefix/suffix or clear actions do not become a second ambiguous field or submit the form."
          }
        },
        {
          id: "input-group-host-and-nested-control",
          when: "A field includes prefixes, suffixes or an embedded action.",
          do: "Use InputGroupAddon and InputGroupButton with the host size, keep labels outside the editable value and let nested controls retain their own activation.",
          avoid:
            "Place a full standalone Button inside the field with caller height patches, or let clicking Copy focus and alter the input instead.",
          reason:
            "The host and its action need compatible geometry and separate interaction ownership.",
          detect: {
            by: "review",
            how: "Compare sm, md and lg groups with text and icon actions. Nested activation does its named work, does not trigger addon focus behavior and does not enlarge the host unexpectedly."
          },
          evidence: [
            "src/components/v4/ui/input-group.tsx",
            "src/pages/design-system/examples/input-group/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "empty",
          guidance:
            "Keep units or scheme visible when they are necessary to interpret the empty value."
        },
        {
          state: "clear",
          guidance: "Clear the intended input without submitting the enclosing form."
        }
      ],
      antiSlop: [
        {
          do: "Use addons for units and tools that act on this value.",
          avoid: "Add decorative icons and badges to both sides of every field.",
          reason: "Extra chrome reduces space for the value without improving the decision."
        },
        {
          do: "Keep addons around one editable value and make every embedded action update that value.",
          avoid:
            "Show a decorative Clear action or infer an inner action height from the outer group size.",
          reason: "Addons share context without changing the input identity or the action recipe."
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
          "npm run ui:dev; open /design-system#input-group and verify the documented interaction."
      }
    ]
  },
  {
    id: "input-otp",
    title: "Input OTP",
    group: "Forms",
    summary: "Enter a fixed-length verification code in connected slots.",
    sourceFiles: ["src/components/v4/ui/input-otp.tsx"],
    exports: ["InputOTP", "InputOTPGroup", "InputOTPSeparator", "InputOTPSlot"],
    referenceNames: ["InputOtp"],
    behavior: [
      "One underlying input owns the whole string; onChange receives that string, including partial and empty values. maxLength defines completion; onComplete signals length completion, not successful verification."
    ],
    accessibility: [
      "Put id, label and error associations on InputOTP's real input. Slots display characters and focus position; they are not separate inputs. Paste and one-time-code autofill use that whole input."
    ],
    limitations: [
      "inputMode only suggests a keyboard; set pattern for numeric or alphanumeric codes explicitly. The library defaults autocomplete to one-time-code and supports pasteTransformer; the host owns verification, retries and rate limits."
    ],
    examples: [
      {
        id: "default",
        title: "Numeric code states",
        module: "./examples/input-otp/default.tsx",
        states: ["default", "disabled", "invalid"]
      },
      {
        id: "controlled",
        title: "Controlled recovery code",
        module: "./examples/input-otp/controlled.tsx",
        states: ["controlled", "keyboard", "success"]
      }
    ],
    coverage: [
      {
        axis: "state",
        expected: [
          "numeric",
          "disabled",
          "invalid",
          "controlled",
          "completion",
          "alphanumeric paste"
        ],
        shown: [
          {
            value: "numeric",
            exampleId: "default",
            label: "Verification code"
          },
          {
            value: "disabled",
            exampleId: "default",
            label: "Verification unavailable"
          },
          {
            value: "invalid",
            exampleId: "default",
            label: "Rejected verification code"
          },
          {
            value: "controlled",
            exampleId: "controlled",
            label: "Recovery code"
          },
          {
            value: "completion",
            exampleId: "controlled",
            label: "Local code complete:"
          },
          {
            value: "alphanumeric paste",
            exampleId: "controlled",
            label: "Recovery code"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Keep a code as one string. Configure its accepted characters and length before connecting completion to host verification."
      ],
      avoid: [],
      decision:
        "Choose InputOTP for a short verification code with a known pattern and length. Use Input for arbitrary tokens or long recovery strings.",
      rules: [
        {
          id: "input-otp-usage",
          when: "The last slot becomes filled.",
          do: "Keep the code as one string and let the host verify it before announcing authentication success.",
          avoid: "Store each slot separately or equate reaching maxLength with a verified code.",
          reason: "A complete code can still be wrong, expired or rejected by the server.",
          evidence: [
            "src/components/v4/ui/input-otp.tsx",
            "src/pages/design-system/examples/input-otp/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Paste a complete code, delete to a partial code and reject verification; one string stays editable and filling the final slot does not announce authentication success."
          }
        },
        {
          id: "input-otp-code-entry-not-verification",
          when: "A verification form accepts a fixed-length code.",
          do: "Set the accepted pattern and length deliberately, allow paste through the supported transformer and let the host verify and rate-limit submissions.",
          avoid:
            "Assume inputMode enforces digits or show Verified when onComplete only means every slot is filled.",
          reason: "Completing an entry is different from a server accepting the code.",
          detect: {
            by: "review",
            how: "Paste valid and invalid characters, fill the final slot and reject verification. The entry contract holds and completion never reports authentication success by itself."
          },
          evidence: [
            "src/components/v4/ui/input-otp.tsx",
            "src/pages/design-system/examples/input-otp/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "partial",
          guidance: "Allow empty and intermediate values so deletion and paste remain usable."
        },
        {
          state: "rejected",
          guidance:
            "Keep a clear verification error and explain whether the person should retry or request a new code."
        }
      ],
      antiSlop: [
        {
          do: "Use separators only where the issued code has meaningful groups.",
          avoid: "Style each slot like a separate form with its own label and error.",
          reason: "The code is one value and should behave like one editing target."
        },
        {
          do: "Keep the slot count consistent with maxLength and show partial, complete and rejected local values.",
          avoid:
            "Treat completion as successful authentication or present different slot groupings as named sizes.",
          reason:
            "Completion reports a whole local value; verification and persistence belong to the host."
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
          "npm run ui:dev; open /design-system#input-otp and verify the documented interaction."
      }
    ]
  },
  {
    id: "label",
    title: "Label",
    group: "Forms",
    summary: "Give a form control a persistent accessible label.",
    sourceFiles: ["src/components/v4/ui/label.tsx"],
    exports: ["Label"],
    referenceNames: ["Label"],
    behavior: [
      "Label forwards native htmlFor and ref through Radix Label; clicking it targets the associated labelable control."
    ],
    accessibility: [
      "Match htmlFor to the actual input ID or nest the control. Description and error text need their own aria-describedby association."
    ],
    limitations: [
      "Label does not connect help/error text or validate a value; Field shorthand can provide those associations for supported controls."
    ],
    examples: [
      {
        id: "default",
        title: "Label association",
        module: "./examples/label/default.tsx",
        states: ["default"]
      },
      {
        id: "states",
        title: "Required and unavailable fields",
        module: "./examples/label/states.tsx",
        states: ["default", "disabled"]
      }
    ],
    coverage: [
      {
        axis: "association",
        expected: ["explicit", "required", "optional", "disabled group"],
        shown: [
          {
            value: "explicit",
            exampleId: "default",
            label: "Environment name"
          },
          {
            value: "required",
            exampleId: "states",
            label: "Name (required)"
          },
          {
            value: "optional",
            exampleId: "states",
            label: "Description (optional)"
          },
          {
            value: "disabled group",
            exampleId: "states",
            label: "Managed name"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Associate Label with the real control id, keep required or optional wording consistent and use Field when help and errors need coordinated wiring."
      ],
      avoid: [
        "Use a label as an unbound section heading or assume nearby text labels a custom control automatically."
      ],
      decision:
        "Choose Label for the persistent visible name of one labelable control. Use Field when the name also needs help or an error.",
      rules: [
        {
          id: "label-usage",
          when: "A custom control is nested inside a styled wrapper.",
          do: "Point htmlFor at the actual focusable control id, or use the control's supported labeling relationship.",
          avoid: "Point htmlFor at a non-labelable div or use only placeholder text.",
          reason: "The label must focus and name the control that receives input.",
          evidence: [
            "src/components/v4/ui/label.tsx",
            "src/pages/design-system/examples/label/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Click each label and inspect the control's accessible name. The actual input receives focus, and entering a value does not remove the visible name."
          }
        }
      ],
      states: [
        {
          state: "required",
          guidance: "Keep the name readable and explain any required marker consistently."
        },
        {
          state: "disabled",
          guidance: "Keep the label legible even when the associated control is unavailable."
        }
      ],
      antiSlop: [
        {
          do: "Write a short name for the value being entered.",
          avoid: "Use Enter your followed by the same noun in every label.",
          reason: "Repeated instructions lengthen forms without identifying a different field."
        },
        {
          do: "Write the field purpose in plain words and mark required, optional and unavailable conditions where they matter.",
          avoid:
            "Use a placeholder as the only name or attach one label to several unrelated controls.",
          reason: "A persistent label lets people identify and return to the intended control."
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
        command: "npm run ui:dev; open /design-system#label and verify the documented interaction."
      }
    ]
  },
  {
    id: "radio-group",
    title: "Radio Group",
    group: "Forms",
    summary: "Choose one option from a visible group.",
    sourceFiles: ["src/components/v4/ui/radio-group.tsx"],
    exports: ["RadioGroup", "RadioGroupItem"],
    referenceNames: ["RadioGroup"],
    behavior: [
      "RadioGroup uses one string value with value/defaultValue and onValueChange. Each RadioGroupItem contributes its own value and disabled state."
    ],
    accessibility: [
      "Name the group and each option with explicit labels. Arrow keys move the choice within the group, and each option announces whether it is checked. Associate any group error explicitly."
    ],
    limitations: [
      "RadioGroup does not consume Field context automatically; label the group and connect its description/error explicitly."
    ],
    examples: [
      {
        id: "default",
        title: "Controlled access choice",
        module: "./examples/radio-group/default.tsx",
        states: ["controlled", "keyboard"]
      },
      {
        id: "states",
        title: "States",
        module: "./examples/radio-group/states.tsx",
        states: ["empty", "invalid", "disabled"]
      },
      {
        id: "orientations",
        title: "Orientation",
        module: "./examples/radio-group/orientations.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "orientation",
        expected: ["horizontal", "vertical"],
        shown: [
          {
            value: "horizontal",
            exampleId: "orientations",
            label: "horizontal"
          },
          {
            value: "vertical",
            exampleId: "orientations",
            label: "vertical"
          }
        ]
      },
      {
        axis: "state",
        expected: [
          "empty uncontrolled",
          "invalid",
          "disabled group",
          "disabled option",
          "controlled"
        ],
        shown: [
          {
            value: "empty uncontrolled",
            exampleId: "states",
            label: "Empty choice"
          },
          {
            value: "invalid",
            exampleId: "states",
            label: "Required choice"
          },
          {
            value: "disabled group",
            exampleId: "states",
            label: "Policy choice"
          },
          {
            value: "disabled option",
            exampleId: "default",
            label: "archived"
          },
          {
            value: "controlled",
            exampleId: "default",
            label: "Environment access"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use a named RadioGroup for mutually exclusive values. State any requirement and connect validation explicitly."
      ],
      avoid: [],
      decision:
        "Choose RadioGroup when exactly one visible alternative is required. Use Checkbox for independent choices and ToggleGroup for optional pressed tools.",
      rules: [
        {
          id: "radio-group-usage",
          when: "The alternatives have different consequences or prices.",
          do: "Label each option and place its explanation beside it; keep one controlled value.",
          avoid: "Assume changing the selected radio persisted the setting before the form saves.",
          reason:
            "Selection and persistence are separate unless the host applies the choice immediately.",
          evidence: [
            "src/components/v4/ui/radio-group.tsx",
            "src/pages/design-system/examples/radio-group/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Select each permitted alternative and submit or cancel the enclosing form; exactly one value is chosen and selection alone does not falsely claim it was saved."
          }
        },
        {
          id: "radio-group-required-choice",
          when: "A form presents mutually exclusive choices.",
          do: "Use stable string values and a named group, connect help/error ids explicitly and let the host decide whether an empty value is valid.",
          avoid:
            "Use ToggleGroup when a required selection must remain, or assume RadioGroup consumes Field context without wiring.",
          reason:
            "A radio choice and optional pressed tools have different empty-state and labeling contracts.",
          detect: {
            by: "review",
            how: "Arrow through enabled choices with a disabled option present. Group name, error description and selected value remain correct before and after validation."
          },
          evidence: [
            "src/components/v4/ui/radio-group.tsx",
            "src/pages/design-system/examples/radio-group/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "empty",
          guidance:
            "Allow an unset value only if the task permits it and explain the requirement on submit."
        },
        {
          state: "disabled",
          guidance: "Keep the unavailable option's explanation visible when it affects the choice."
        }
      ],
      antiSlop: [
        {
          do: "Write parallel option labels that expose the difference.",
          avoid: "Use a radio list as navigation to unrelated pages.",
          reason: "A radio group communicates one value, not a route menu."
        },
        {
          do: "Make empty, invalid and policy-disabled selection visible beside ordinary choices.",
          avoid:
            "Preselect an answer only to make the specimen look complete or use radio buttons for independent flags.",
          reason: "Mutual exclusion and a deliberate empty value must remain understandable."
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
          "npm run ui:dev; open /design-system#radio-group and verify the documented interaction."
      }
    ]
  },
  {
    id: "select",
    title: "Select",
    group: "Forms",
    summary: "Choose one value from a Radix listbox.",
    sourceFiles: ["src/components/v4/ui/select.tsx"],
    exports: [
      "Select",
      "SelectContent",
      "SelectGroup",
      "SelectItem",
      "SelectLabel",
      "SelectScrollDownButton",
      "SelectScrollUpButton",
      "SelectSeparator",
      "SelectTrigger",
      "SelectValue"
    ],
    referenceNames: ["Select"],
    behavior: [
      "Default and sm are 32px aliases; md is 36px and lg is 40px.",
      "Select accepts grouped options, disabled entries, label/placeholder, size and invalid state, or retained Radix parts. value/defaultValue and onChange/onValueChange use the selected string.",
      "The selected trigger contains the option label only. Option descriptions remain readable in the menu and are associated through aria-describedby; they do not change the stored value."
    ],
    accessibility: [
      "Provide a persistent label. Connect invalid feedback with aria-describedby and preserve disabled semantics."
    ],
    limitations: [
      "Options are local and string-valued; remote search, custom object identity and persisted changes belong to the host."
    ],
    examples: [
      {
        id: "default",
        title: "Environment field",
        module: "./examples/select/default.tsx",
        states: ["default", "controlled"]
      },
      {
        id: "sizes",
        title: "Sizes",
        module: "./examples/select/sizes.tsx",
        states: ["default"]
      },
      {
        id: "metadata",
        title: "Long metadata and menu width",
        module: "./examples/select/metadata.tsx",
        states: ["default", "overflow"]
      }
    ],
    coverage: [
      {
        axis: "size",
        slot: "select-trigger",
        expected: ["sm", "default", "md", "lg"],
        shown: [
          {
            value: "sm",
            exampleId: "sizes",
            label: "default, sm",
            aliasOf: "default"
          },
          {
            value: "default",
            exampleId: "sizes",
            label: "default, sm"
          },
          {
            value: "md",
            exampleId: "sizes",
            label: "md"
          },
          {
            value: "lg",
            exampleId: "sizes",
            label: "lg"
          }
        ]
      },
      {
        axis: "SelectTrigger.size",
        expected: ["sm", "default", "md", "lg"],
        shown: [
          {
            value: "sm",
            exampleId: "sizes",
            label: "default, sm",
            aliasOf: "default"
          },
          {
            value: "default",
            exampleId: "sizes",
            label: "default, sm"
          },
          {
            value: "md",
            exampleId: "sizes",
            label: "md"
          },
          {
            value: "lg",
            exampleId: "sizes",
            label: "lg"
          }
        ]
      },
      {
        axis: "alignment",
        expected: ["start", "center", "end"],
        shown: [],
        omitted: [
          {
            value: "start",
            reason:
              "The menu's alignment shows only while it is open and moves it a few pixels against the trigger, so a static page cannot show it. start is the default."
          },
          {
            value: "center",
            reason: "Set align on SelectContent; the closed trigger looks the same."
          },
          {
            value: "end",
            reason: "Set align on SelectContent; the closed trigger looks the same."
          }
        ]
      },
      {
        axis: "state",
        expected: ["empty", "invalid", "disabled", "disabled option", "controlled"],
        shown: [
          {
            value: "disabled option",
            exampleId: "default",
            label: "Archived"
          },
          {
            value: "controlled",
            exampleId: "default",
            label: "Current environment:"
          }
        ],
        omitted: [
          {
            value: "empty",
            reason:
              "The placeholder, invalid and disabled states use the shared field surface, which the Input and Field examples show once."
          },
          {
            value: "invalid",
            reason:
              "The placeholder, invalid and disabled states use the shared field surface, which the Input and Field examples show once."
          },
          {
            value: "disabled",
            reason:
              "The placeholder, invalid and disabled states use the shared field surface, which the Input and Field examples show once."
          }
        ]
      },
      {
        axis: "composition",
        expected: ["long metadata", "menu width"],
        shown: [
          {
            value: "long metadata",
            exampleId: "metadata",
            label: "Long resource identifier"
          },
          {
            value: "menu width",
            exampleId: "metadata",
            label: "Long metadata, wide menu"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use Select for a closed list, choose supported trigger sizing and keep purpose visible through an external Field label."
      ],
      avoid: [
        "Use placeholder text as the only name, pass an object as a value or imply the menu performs remote search."
      ],
      decision:
        "Choose Select for one known value when a custom grouped popup is useful. Use Combobox when the list needs search.",
      rules: [
        {
          id: "select-usage",
          when: "The saved option is temporarily unavailable.",
          do: "Keep its label visible and explain why a different choice may be needed rather than silently clearing it.",
          avoid:
            "Offer hundreds of unsearchable rows or encode an empty placeholder as a real option.",
          reason: "The popup should make one known choice easy to inspect and change.",
          evidence: [
            "src/components/v4/ui/select.tsx",
            "src/pages/design-system/examples/select/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Choose, reopen and inspect a known option. The saved label remains distinguishable; a large unsearchable option set is redirected to an appropriate searchable picker."
          }
        },
        {
          id: "select-selected-value",
          when: "An option includes a long description.",
          do: "Keep the label in the selected trigger and the associated description beside the menu option. Constrain the trigger to its field and allow long menu text to wrap.",
          avoid:
            "Concatenate the description into the selected label or grow the trigger beyond the preview.",
          reason:
            "Supplementary context must remain readable without changing the saved identity or pushing neighboring controls away.",
          evidence: [
            "src/components/v4/ui/select.tsx",
            "src/pages/design-system/examples/select/metadata.tsx"
          ],
          detect: {
            by: "review",
            how: "Select the long described option at 320px with doubled root text. The trigger stays within its field, contains only the selected label, and reopening exposes the complete label and associated description. Repeat with controlled and default-valued Selects."
          }
        }
      ],
      states: [
        {
          state: "empty",
          guidance: "Show a placeholder until a valid option is selected."
        },
        {
          state: "disabled",
          guidance:
            "Explain the prerequisite outside a disabled trigger because it cannot receive focus."
        },
        {
          state: "long selected label",
          guidance:
            "Keep only the option label in the trigger. The bounded trigger can truncate a long label; reopening must expose the full label and associated description in the menu."
        }
      ],
      antiSlop: [
        {
          do: "Group options only when the group names help distinguish choices.",
          avoid: "Add icons and separators to every row of a short homogeneous list.",
          reason:
            "Unnecessary grouping slows the simple selection the control is intended to support."
        },
        {
          do: "Keep low-level trigger sizes and menu placement as separate supported compositions.",
          avoid:
            "Treat every high-level prop as a low-level Content prop or describe an in-memory Select as searchable.",
          reason:
            "Select supports fewer options than the lower-level parts it wraps, so a prop that works on one may not exist on the other."
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
        command: "npm run ui:dev; open /design-system#select and verify the documented interaction."
      }
    ]
  },
  {
    id: "slider",
    title: "Slider",
    group: "Forms",
    summary: "Choose a numeric value or range from a bounded scale.",
    sourceFiles: ["src/components/v4/ui/slider.tsx"],
    exports: ["Slider"],
    referenceNames: ["Slider"],
    behavior: [
      "Radix value/defaultValue is a number array; onValueChange reports live adjustment and onValueCommit reports committed adjustment. Array length determines the number of thumbs."
    ],
    accessibility: [
      "Name each thumb with thumbLabels or aria-labelledby; with one shared label, each thumb gets that label plus its position. Each thumb announces its minimum, maximum and value, and arrow keys adjust it."
    ],
    limitations: [
      "The owner chooses units, rounding and when to save. A slider is approximate; provide a numeric input when exact entry matters."
    ],
    examples: [
      {
        id: "default",
        title: "Single, range and disabled",
        module: "./examples/slider/default.tsx",
        states: ["controlled", "disabled", "keyboard"]
      }
    ],
    coverage: [
      {
        axis: "orientation",
        expected: ["horizontal", "vertical"],
        shown: [{ value: "horizontal", exampleId: "default", label: "Single" }],
        omitted: [
          {
            value: "vertical",
            reason:
              "The same track and thumb on the vertical axis, for a tall side panel. It needs a fixed height."
          }
        ]
      },
      {
        axis: "inverted",
        expected: ["false", "true"],
        shown: [{ value: "false", exampleId: "default", label: "Single" }],
        omitted: [
          {
            value: "true",
            reason: "Reverses the value direction without changing the paint."
          }
        ]
      },
      {
        axis: "state",
        expected: ["single controlled", "range", "disabled", "minimum spacing", "commit callback"],
        shown: [
          { value: "single controlled", exampleId: "default", label: "Single" },
          { value: "range", exampleId: "default", label: "Range" },
          { value: "disabled", exampleId: "default", label: "Disabled" },
          { value: "minimum spacing", exampleId: "default", label: "Range" }
        ],
        omitted: [
          {
            value: "commit callback",
            reason:
              "onValueCommit fires on release. It changes no paint, so a still example cannot show it."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Label the quantity and units, choose min/max/step deliberately and use onValueCommit only for the host's intended commit boundary."
      ],
      avoid: [
        "Hide the current number, save on every movement unintentionally or use a slider alone when exact entry is required."
      ],
      decision:
        "Choose Slider for an approximate bounded quantity with a visible current value. Use numeric Input when exact typed entry is the main task.",
      rules: [
        {
          id: "slider-usage",
          when: "A range has two thumbs with different meanings.",
          do: "Name each thumb distinctly, expose its current value, and commit expensive work only at the intended boundary.",
          avoid:
            "Give both thumbs the same label or persist every intermediate pointer movement without intent.",
          reason: "The user must know which bound is changing and when it takes effect.",
          evidence: [
            "src/components/v4/ui/slider.tsx",
            "src/pages/design-system/examples/slider/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Adjust each thumb with keyboard and pointer. Distinct names, current numeric values, bounds and units make the changed quantity clear before it is committed."
          }
        }
      ],
      states: [
        {
          state: "dragging",
          guidance: "Update the visible draft while preserving the chosen commit policy."
        },
        {
          state: "bounds",
          guidance: "Show the valid minimum, maximum and unit so endpoints are understandable."
        }
      ],
      antiSlop: [
        {
          do: "Use a slider where continuous adjustment helps compare outcomes.",
          avoid: "Use a long slider to choose a precise account ID or an arbitrary date.",
          reason: "Those values are not approximate quantities and need a different input model."
        },
        {
          do: "Name every thumb and distinguish the current draft from the value reported by onValueCommit.",
          avoid:
            "Give both ends the same accessible name or claim a committed value from a visual thumb movement alone.",
          reason: "A range contains independently meaningful values and a separate commit event."
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
        command: "npm run ui:dev; open /design-system#slider and verify the documented interaction."
      }
    ]
  },
  {
    id: "switch",
    title: "Switch",
    group: "Forms",
    summary: "Apply an immediate boolean setting with its own pending and recovery state.",
    sourceFiles: ["src/components/v4/ui/switch.tsx"],
    exports: ["Switch"],
    referenceNames: ["Switch"],
    behavior: [
      "Switch applies an immediate boolean setting, with row layout, small size and disabled states. onChange/onCheckedChange belong to the owner. Off is a light grey track with a dimmed knob (white with a hairline in light, grey in dark); on is a mid grey track with a pure white knob. The knob slides 16px (12px at sm) on the fast motion token. Focus draws the 2px ink outline shared with checkbox and radio."
    ],
    accessibility: [
      "Label the switch and keep its name stable when its checked state changes. Do not stage it behind Save."
    ],
    limitations: [
      "Switch reports boolean changes but does not persist or roll them back; the host must represent pending and failed updates truthfully."
    ],
    examples: [
      {
        id: "default",
        title: "Layouts",
        module: "./examples/switch/default.tsx",
        states: ["default", "controlled"]
      },
      {
        id: "sizes",
        title: "Sizes",
        module: "./examples/switch/sizes.tsx",
        states: ["default"]
      },
      {
        id: "states",
        title: "States and layout",
        module: "./examples/switch/states.tsx",
        states: ["default", "invalid", "disabled"]
      }
    ],
    coverage: [
      {
        axis: "size",
        expected: ["sm", "default"],
        shown: [
          {
            value: "sm",
            exampleId: "sizes",
            label: "sm"
          },
          {
            value: "default",
            exampleId: "sizes",
            label: "default"
          }
        ]
      },
      {
        axis: "layout",
        expected: ["default", "row"],
        shown: [
          {
            value: "default",
            exampleId: "default",
            label: "Inline"
          },
          {
            value: "row",
            exampleId: "default",
            label: "Row with description"
          }
        ]
      },
      {
        axis: "state",
        expected: [
          "unchecked",
          "checked",
          "disabled unchecked",
          "disabled checked",
          "invalid",
          "external label",
          "pending",
          "failure and retry",
          "controlled saved state"
        ],
        shown: [
          {
            value: "unchecked",
            exampleId: "states",
            label: "Off"
          },
          {
            value: "checked",
            exampleId: "states",
            label: "On"
          },
          {
            value: "disabled unchecked",
            exampleId: "states",
            label: "Disabled, off"
          },
          {
            value: "disabled checked",
            exampleId: "states",
            label: "Disabled, on"
          },
          {
            value: "controlled saved state",
            exampleId: "default",
            label: "Inline"
          }
        ],
        omitted: [
          {
            value: "invalid",
            reason:
              "aria-invalid draws the red control border. A switch is rarely a required answer; Field shows the error rendering."
          },
          {
            value: "external label",
            reason: "An id and a Label with htmlFor. The Label page shows the association."
          },
          {
            value: "pending",
            reason:
              "Switch exposes controlled checked, disabled and invalid states. Request pending and retry belong to its caller."
          },
          {
            value: "failure and retry",
            reason:
              "Switch exposes controlled checked, disabled and invalid states. Request pending and retry belong to its caller."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Let the host represent pending, failure and rollback or retry, keep its label stable and use Checkbox when a later Save stages the value."
      ],
      avoid: [
        "Show the new saved state before the request resolves or combine an immediate Switch with a contradictory Save footer."
      ],
      decision:
        "Choose Switch for an immediately applied boolean setting. Use Checkbox when a form stages the change until Save.",
      rules: [
        {
          id: "switch-usage",
          when: "Turning a setting on starts a request that can fail.",
          do: "Keep the label stable, show pending feedback, and restore or explain the actual saved state on rejection.",
          avoid:
            "Place an immediate-looking switch behind a separate Save button or leave it on after a rejected change.",
          reason: "The switch communicates a current setting rather than an unsaved draft.",
          evidence: [
            "src/components/v4/ui/switch.tsx",
            "src/pages/design-system/examples/switch/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Reject an immediate setting change. The displayed saved state and error reflect the host result; an unsaved checkbox-like draft is not presented as an applied switch."
          }
        }
      ],
      states: [
        {
          state: "pending",
          guidance: "Prevent conflicting repeated changes while the host applies the setting."
        },
        {
          state: "error",
          guidance: "Explain the failed change next to the switch and show the actual state."
        }
      ],
      antiSlop: [
        {
          do: "Name the setting, such as Audit logging.",
          avoid: "Change the label between Enable logging and Disable logging with every toggle.",
          reason:
            "The state already communicates on or off; changing the name makes the control harder to track."
        },
        {
          do: "Keep the saved value and a named pending result until the local operation succeeds; preserve it on rejection.",
          avoid:
            "Render the requested value as already saved or leave a pending indicator after failure.",
          reason:
            "An immediate setting must reflect the actual host result and offer a usable retry."
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
        command: "npm run ui:dev; open /design-system#switch and verify the documented interaction."
      }
    ]
  },
  {
    id: "textarea",
    title: "Textarea",
    group: "Forms",
    summary: "Enter multiline prose with native text editing.",
    sourceFiles: ["src/components/v4/ui/textarea.tsx"],
    exports: ["Textarea"],
    referenceNames: ["Textarea"],
    behavior: [
      "Textarea forwards native value/defaultValue, onChange events and the textarea ref. Field association and invalid state reach the leaf; content sizing keeps a minimum editing area."
    ],
    accessibility: [
      "Use Field or an explicit label/id, and connect errors with aria-describedby. Keep readOnly values selectable and distinguish disabled inputs from editable ones."
    ],
    limitations: [
      "Textarea edits plain text; syntax highlighting, rich editing and serialization are separate components or host concerns."
    ],
    examples: [
      {
        id: "default",
        title: "States",
        module: "./examples/textarea/default.tsx",
        states: ["default", "invalid", "disabled"]
      },
      {
        id: "editing",
        title: "Controlled notes",
        module: "./examples/textarea/editing.tsx",
        states: ["controlled", "read-only", "empty"]
      }
    ],
    coverage: [
      {
        axis: "state",
        expected: ["default", "invalid", "disabled", "read-only", "empty", "controlled"],
        shown: [
          {
            value: "default",
            exampleId: "default",
            label: "Connection description"
          },
          {
            value: "invalid",
            exampleId: "default",
            label: "Change reason"
          },
          {
            value: "disabled",
            exampleId: "default",
            label: "Managed description"
          },
          {
            value: "read-only",
            exampleId: "editing",
            label: "Saved notes"
          },
          {
            value: "empty",
            exampleId: "editing",
            label: "Empty notes"
          },
          {
            value: "controlled",
            exampleId: "editing",
            label: "Draft notes"
          }
        ]
      },
      {
        axis: "composition",
        expected: ["native rows and cols"],
        shown: [
          {
            value: "native rows and cols",
            exampleId: "editing",
            label: "Draft notes"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use native rows and host validation, retain line breaks and exact draft text and allow enough vertical growth or scrolling to review the entry."
      ],
      avoid: [
        "Add syntax meaning through colored text alone, silently trim a payload or fix height so errors and actions hide the last lines."
      ],
      decision:
        "Choose Textarea for multiline plain text. Use Input for a single line, Code for read-only syntax and SensitiveEditor for protected stored values.",
      rules: [
        {
          id: "textarea-usage",
          when: "The value contains deliberate line breaks or leading spaces.",
          do: "Preserve the literal draft and allow native selection, newline entry and copying.",
          avoid: "Trim, reformat or suppress Enter without an explicit task requirement.",
          reason:
            "Whitespace can be part of the value and ordinary multiline editing depends on native behavior.",
          evidence: [
            "src/components/v4/ui/textarea.tsx",
            "src/pages/design-system/examples/textarea/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Enter and copy text with leading spaces and line breaks; the exact draft survives editing, invalid submission and readonly inspection."
          }
        }
      ],
      states: [
        {
          state: "invalid",
          guidance: "Keep the exact entered text and explain the rejected constraint."
        },
        {
          state: "read-only",
          guidance: "Allow selection and copy when editing is unavailable but reading is permitted."
        }
      ],
      antiSlop: [
        {
          do: "Choose a starting height that reveals enough of the expected content.",
          avoid:
            "Use a one-line-high textarea for long policy text or an enormous box for a short note.",
          reason: "The visible measure should support reviewing the actual value."
        },
        {
          do: "Keep multiline and unbroken synthetic values exact in both the editor and its local result.",
          avoid: "Trim line breaks to fit the preview or invent density names from rows and cols.",
          reason:
            "Rows and cols are native hints; a note can contain significant spacing and line breaks."
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
          "npm run ui:dev; open /design-system#textarea and verify the documented interaction."
      }
    ]
  }
] satisfies readonly ComponentDefinition[];
