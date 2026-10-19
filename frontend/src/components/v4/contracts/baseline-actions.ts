import type { ComponentDefinition } from "./types";

export const baselineActions = [
  {
    id: "button",
    title: "Button",
    group: "Actions",
    summary: "Trigger a named action with a clear emphasis and pending state.",
    sourceFiles: [
      "src/components/v4/ui/button.tsx",
      "src/components/v4/ui/button-material.module.css",
      "src/components/v4/tokens.json"
    ],
    exports: ["Button", "buttonVariants"],
    referenceNames: ["Button"],
    behavior: [
      "Primary (and default, its alias) is the ink fill with an on-ink label at 600 for the one main action in a view or dialog; hover moves to text2. Accent keeps the bright lime face with owned inset illumination, for approval and grant moments only, never as a second primary. Ghost hover is ink at opacity-hover (6% light, 12% dark), so it shows on raised surfaces. Other variants retain their semantic roles. link is link-coloured text that underlines on hover. Native button and slot composition preserve interaction semantics.",
      "The text sizes are 32px (default, with sm as its alias), 36px (md) and 40px (lg), with 10, 14 and 16px insets and the shared 14px label. icon matches default at 32px and icon-lg matches lg at 40px; iconOnly makes any text size square. xs, icon-xs (24px) and icon-sm (28px) are nested and chrome sizes. Nested control actions consume the host slot instead of inheriting a standalone action's geometry. Size names do not guarantee a touch target."
    ],
    accessibility: [
      "Use a real button for an action and asChild with an anchor for navigation. Name icon-only buttons. Native disabled removes activation, while loading remains focusable and exposes busy/disabled semantics."
    ],
    limitations: [
      "The owner runs the operation and updates loading. Button does not start requests, show result notifications or impose a destructive confirmation.",
      "Button has no read-only prop. Use disabled for unavailable actions, or show read-only content without an action."
    ],
    examples: [
      {
        id: "default",
        title: "Variants",
        module: "./examples/button/default.tsx",
        states: ["default", "loading"]
      },
      {
        id: "sizes",
        title: "Sizes",
        module: "./examples/button/sizes.tsx",
        states: ["default"]
      },
      {
        id: "states",
        title: "Loading and disabled",
        module: "./examples/button/states.tsx",
        states: ["default", "loading", "disabled"]
      },
      {
        id: "composition",
        title: "Icons and links",
        module: "./examples/button/composition.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "variant",
        expected: [
          "default",
          "primary",
          "accent",
          "outline",
          "secondary",
          "ghost",
          "destructive",
          "danger-ghost",
          "link"
        ],
        shown: [
          { value: "default", exampleId: "default", label: "default" },
          { value: "accent", exampleId: "default", label: "accent" },
          { value: "outline", exampleId: "default", label: "outline" },
          { value: "ghost", exampleId: "default", label: "ghost" },
          { value: "destructive", exampleId: "default", label: "destructive" },
          { value: "link", exampleId: "default", label: "link" }
        ],
        omitted: [
          {
            value: "primary",
            reason: "Default is the alias of primary: the same ink fill."
          },
          {
            value: "secondary",
            reason:
              "A tint-filled peer of outline for dense toolbars. It adds no new decision to the comparison."
          },
          {
            value: "danger-ghost",
            reason:
              "The quiet form of destructive for a row action next to other ghost actions. Same red text as destructive without the fill."
          }
        ]
      },
      {
        axis: "size",
        expected: ["xs", "sm", "default", "md", "lg", "icon-xs", "icon-sm", "icon", "icon-lg"],
        shown: [
          { value: "default", exampleId: "sizes", label: "default, sm" },
          { value: "sm", exampleId: "sizes", label: "default, sm", aliasOf: "default" },
          { value: "md", exampleId: "sizes", label: "md" },
          { value: "lg", exampleId: "sizes", label: "lg" },
          { value: "icon", exampleId: "sizes", label: "icon" },
          { value: "icon-lg", exampleId: "sizes", label: "icon-lg" }
        ],
        omitted: [
          {
            value: "xs",
            reason:
              "24px, below the 32/36/40 control scale. Reserved for actions nested inside another control, such as a chip or a field slot."
          },
          {
            value: "icon-xs",
            reason: "24px nested icon action, the icon partner of xs. Same reason as xs."
          },
          {
            value: "icon-sm",
            reason:
              "28px icon action for overlay chrome such as a dialog or sheet close. It sits inside a header, never beside text Buttons."
          }
        ]
      },
      {
        axis: "icon placement",
        expected: ["none", "leading", "trailing", "icon-only"],
        shown: [
          { value: "none", exampleId: "default", label: "outline" },
          { value: "leading", exampleId: "composition", label: "Leading icon" },
          { value: "trailing", exampleId: "composition", label: "Trailing icon" },
          { value: "icon-only", exampleId: "composition", label: "Icon only" }
        ]
      },
      {
        axis: "state and behavior",
        expected: [
          "idle",
          "disabled",
          "invalid",
          "pending",
          "pending with icon",
          "controlled loading=false",
          "selected",
          "local result",
          "local failure and retry",
          "slotted anchor",
          "read-only"
        ],
        shown: [
          { value: "idle", exampleId: "states", label: "Idle" },
          { value: "disabled", exampleId: "states", label: "Disabled" },
          { value: "pending", exampleId: "states", label: "Loading" },
          { value: "pending with icon", exampleId: "states", label: "Loading with icon" },
          { value: "controlled loading=false", exampleId: "states", label: "Idle" },
          { value: "slotted anchor", exampleId: "composition", label: "Trailing icon" }
        ],
        omitted: [
          {
            value: "invalid",
            reason:
              "aria-invalid draws the red control border. A Button is rarely the invalid control; the field it opens carries the error."
          },
          {
            value: "selected",
            reason:
              "selected sets aria-pressed and paints the shared selected recipe. Toggle shows that recipe; use Toggle for a persistent pressed choice."
          },
          {
            value: "read-only",
            reason:
              "Button has no read-only prop. Read-only content does not imply an available action; unavailable actions use disabled."
          },
          {
            value: "local result",
            reason:
              "Button exposes loading and activation. Requests, draft persistence, results and retry are owned by its caller."
          },
          {
            value: "local failure and retry",
            reason:
              "Button exposes loading and activation. Requests, draft persistence, results and retry are owned by its caller."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Choose emphasis with variant and geometry with size. default, primary and accent share one lime treatment; default and sm are size aliases. Give a pending action a leading icon when its label must stay visible while it works."
      ],
      avoid: [],
      decision:
        "Choose Button for an action. Use a native link for a destination, Toggle for a persistent pressed choice and Switch for an immediate setting.",
      rules: [
        {
          id: "button-usage",
          when: "A form has one save action and several supporting actions.",
          do: "Use the shared lime Button for Save changes, use outline or ghost for Review draft and Discard, and keep the button's size and name while saving.",
          avoid:
            "Give every action the strongest lime emphasis, repaint the shared material in caller styles or replace Save changes with an unlabeled spinner.",
          reason:
            "Emphasis identifies the next action, while a stable name preserves task context during pending work.",
          evidence: [
            "src/components/v4/ui/button.tsx",
            "src/pages/design-system/examples/button/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Toggle an explicitly supplied loading boolean. The action keeps its name and bounds, rejects repeat activation and retains visible keyboard focus in both themes."
          }
        },
        {
          id: "button-size-and-state-comparison",
          when: "Primary and supporting actions appear beside one another.",
          do: "Use the supported size recipes for peer actions and keep the shared lime paint. Passing loading never changes padding, so pass it whenever the operation can become pending.",
          avoid:
            "Compensate for a borderless appearance with caller padding, add a new gradient or remove the action label while loading.",
          reason:
            "A shared size owns border-inclusive geometry; state and emphasis should not move the neighboring actions.",
          detect: {
            by: "review",
            how: "Compare filled and outline peers at every supported text size, then enter pending and keyboard focus. Their outer heights and alignment remain stable without caller geometry patches."
          },
          evidence: [
            "src/components/v4/ui/button.tsx",
            "src/pages/design-system/examples/button/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "pending",
          guidance:
            "Pass loading={pending}. The spinner overlays the button, so its width and padding stay the same whether loading is absent, false or true. With a leading icon the spinner replaces the icon and the label stays readable. Report success only after the actual operation completes."
        },
        {
          state: "disabled",
          guidance:
            "Explain policy or prerequisites outside a disabled control because it cannot receive focus."
        }
      ],
      antiSlop: [
        {
          do: "Write action labels that name the outcome.",
          avoid: "Show default, primary, outline and ghost as the human-facing action labels.",
          reason:
            "Variant names belong in comparison captions. Product action labels identify the outcome."
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
        command: "npm run ui:dev; open /design-system#button and verify the documented interaction."
      }
    ]
  },
  {
    id: "button-group",
    title: "Button Group",
    group: "Actions",
    summary: "Join related actions without giving each its own container.",
    sourceFiles: ["src/components/v4/ui/button-group.tsx"],
    exports: ["ButtonGroup", "ButtonGroupSeparator", "ButtonGroupText", "buttonGroupVariants"],
    referenceNames: ["ButtonGroup"],
    behavior: [
      "attached joins peer Buttons on a shared edge, so they read as one control: Older and Newer, or a split action. toolbar keeps each Button separate with a 4px gap and one tab stop; arrow keys and Home/End move among enabled actions, and ButtonGroupSeparator splits it into sets with one 1px line. spaced is a wrapping row with an 8px gap. ButtonGroupText is a non-interactive segment at the height of its neighbors. A separator between two outline Buttons is hidden, because their borders already draw the line."
    ],
    accessibility: [
      "Name a toolbar for its action set; use ordinary groups when each button should keep its own tab stop."
    ],
    limitations: [
      "Toolbar focus visits native button, link and role=button descendants; selection and action effects belong to the host."
    ],
    examples: [
      {
        id: "default",
        title: "Attached and toolbar",
        module: "./examples/button-group/default.tsx",
        states: ["default", "keyboard"]
      }
    ],
    coverage: [
      {
        axis: "variant",
        expected: ["attached", "toolbar", "spaced"],
        shown: [
          { value: "attached", exampleId: "default", label: "attached" },
          { value: "toolbar", exampleId: "default", label: "toolbar" }
        ],
        omitted: [
          {
            value: "spaced",
            reason:
              "Layout only: separate Buttons in a wrapping row with an 8px gap, kept for a set that must wrap at narrow widths. It has no join and no keyboard model of its own."
          }
        ]
      },
      {
        axis: "orientation",
        expected: ["horizontal", "vertical"],
        omitted: [
          {
            value: "horizontal",
            reason: "The default. Both examples on this page are horizontal."
          },
          {
            value: "vertical",
            reason:
              "The same joins rotated for a narrow side panel: the shared edge moves from left/right to top/bottom and toolbar arrows become up/down."
          }
        ],
        shown: []
      },
      {
        axis: "composition",
        expected: ["group text", "separator", "roving focus"],
        shown: [
          { value: "group text", exampleId: "default", label: "attached" },
          { value: "separator", exampleId: "default", label: "toolbar" },
          { value: "roving focus", exampleId: "default", label: "toolbar" }
        ]
      }
    ],
    guidance: {
      use: [
        "Keep peer sizes aligned and use toolbar only for a named action set that benefits from roving focus; use spaced layout when attached actions cannot fit."
      ],
      avoid: [
        "Mix unrelated action sizes, nest another focus system inside a toolbar or conceal essential actions beyond an unreachable edge."
      ],
      decision:
        "Choose ButtonGroup to join related actions. Use Tabs for peer panels, ToggleGroup for pressed choices and RadioGroup for one required value.",
      rules: [
        {
          id: "button-group-usage",
          when: "Several compact tools act on the same resource.",
          do: "Group Inspect and Compare together, name the group, and use toolbar only when arrow-key focus is intended.",
          avoid: "Build an All, Reads, Writes view selector from ordinary grouped action buttons.",
          reason:
            "The shared edge signals related actions. It does not supply a selected-value model, and nonwrapping groups still need a usable narrow layout.",
          evidence: [
            "src/components/v4/ui/button-group.tsx",
            "src/pages/design-system/examples/button-group/default.tsx"
          ],
          detect: {
            by: "review",
            how: "At the narrowest supported width, reach every grouped action. Toolbar arrows move focus among enabled tools without changing a field or pretending to select a peer panel."
          }
        }
      ],
      states: [
        {
          state: "toolbar",
          guidance:
            "Keep a meaningful group label and allow arrow keys to move among enabled tools."
        },
        {
          state: "narrow",
          guidance:
            "Use a spaced group or an outer wrapping layout when attached actions cannot fit."
        }
      ],
      antiSlop: [
        {
          do: "Group tools by the object they affect.",
          avoid: "Add a border around unrelated page actions simply to fill a toolbar.",
          reason: "The shared edge implies a relationship that the actions do not have."
        },
        {
          do: "Name tools by the actual local operation and keep vertical focus movement aligned with the visible column.",
          avoid:
            "Label every tool Action or simulate a completed network check without performing one.",
          reason:
            "A group communicates related operations and a toolbar adds a specific keyboard axis."
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
          "npm run ui:dev; open /design-system#button-group and verify the documented interaction."
      }
    ]
  },
  {
    id: "toggle",
    title: "Toggle",
    group: "Actions",
    summary: "Turn a single pressed state on or off.",
    sourceFiles: ["src/components/v4/ui/toggle.tsx"],
    exports: ["Toggle", "toggleVariants"],
    referenceNames: ["Toggle"],
    behavior: [
      "Radix pressed/defaultPressed and onPressedChange model one independent boolean choice. Off is a bordered control on the surface (outline, the default). Hover tints it. On fills it with the shared selected paint, a darker neutral with a stronger border, so hover never reads as pressed. ghost drops the off border for a dense toolbar. Sizes follow Button: default and sm 32px, md 36px, lg 40px. An icon-only Toggle is square."
    ],
    accessibility: [
      "Use a stable accessible name and let aria-pressed communicate state. Keep a visible focus indicator and disabled semantics."
    ],
    limitations: [
      "Pressed state does not save a preference by itself; the owner chooses whether the choice is immediate or local to a view."
    ],
    examples: [
      {
        id: "default",
        title: "Off and on",
        module: "./examples/toggle/default.tsx",
        states: ["default", "controlled"]
      },
      {
        id: "variants",
        title: "Variants",
        module: "./examples/toggle/variants.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "variant",
        expected: ["outline", "default", "ghost"],
        shown: [
          { value: "outline", exampleId: "variants", label: "outline" },
          { value: "ghost", exampleId: "variants", label: "ghost" }
        ],
        omitted: [
          {
            value: "default",
            reason: "Alias of outline, kept so existing callers keep a bordered Toggle."
          }
        ]
      },
      {
        axis: "size",
        expected: ["default", "sm", "md", "lg"],
        shown: [],
        omitted: [
          {
            value: "default",
            reason:
              "Toggle uses the Button size scale. Every Toggle on this page is the 32px default."
          },
          { value: "sm", reason: "Alias of default, as on Button." },
          { value: "md", reason: "36px, the Button md geometry. The Button page compares sizes." },
          { value: "lg", reason: "40px, the Button lg geometry. The Button page compares sizes." }
        ]
      },
      {
        axis: "state",
        expected: ["controlled", "disabled", "invalid", "uncontrolled pressed"],
        shown: [
          { value: "controlled", exampleId: "default", label: "Text, on" },
          { value: "uncontrolled pressed", exampleId: "default", label: "Icon, on" }
        ],
        omitted: [
          {
            value: "disabled",
            reason: "50% opacity and no pointer events, the same as a disabled Button."
          },
          {
            value: "invalid",
            reason:
              "aria-invalid draws the red control border. A Toggle is rarely a required answer; use a field for that."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Keep its accessible name stable and let aria-pressed describe the state. Use outline unless the row already frames the tools, then ghost."
      ],
      avoid: [
        "Change the label from Enable X to Disable X without a consistent name or use a pressed tool to imply a saved preference."
      ],
      decision:
        "Choose Toggle for an optional pressed view or formatting choice. Use Switch for an immediately persisted setting and Button for a one-time action.",
      rules: [
        {
          id: "toggle-usage",
          when: "A preview can be shown or hidden without changing saved data.",
          do: "Keep the name Show preview stable and express the state through pressed state.",
          avoid:
            "Rename the control after every press or claim that changing view state saved a preference.",
          reason: "A stable action name and pressed state make the same control easy to track.",
          evidence: [
            "src/components/v4/ui/toggle.tsx",
            "src/pages/design-system/examples/toggle/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Toggle the preview twice. The control name stays stable, pressed state agrees with the visible preview and no one-time action remains falsely pressed."
          }
        }
      ],
      states: [
        {
          state: "pressed",
          guidance: "Keep the associated preview consistent with the controlled state."
        },
        {
          state: "disabled",
          guidance: "Retain the reason the optional tool is unavailable nearby."
        }
      ],
      antiSlop: [
        {
          do: "Use persistent pressed styling only for persistent choices.",
          avoid: "Leave a one-time Copy action visually pressed after it succeeds.",
          reason: "Pressed appearance implies a continuing mode that copying does not create."
        },
        {
          do: "Use a stable task label and make the pressed state control actual visible content.",
          avoid:
            "Change only the paint while claiming that details were shown or use generic Submit labels.",
          reason: "The pressed value needs an observable purpose beyond a state attribute."
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
        command: "npm run ui:dev; open /design-system#toggle and verify the documented interaction."
      }
    ]
  },
  {
    id: "toggle-group",
    title: "Toggle Group",
    group: "Actions",
    summary: "Select one or several pressed options in a compact group.",
    sourceFiles: ["src/components/v4/ui/toggle-group.tsx"],
    exports: ["ToggleGroup", "ToggleGroupItem"],
    referenceNames: ["ToggleGroup"],
    behavior: [
      "Radix type=single uses a string and type=multiple uses a string array with onValueChange. Items are joined into one segmented control by default (spacing 0), drawn like segmented Tabs: a tint track with 2px inset, borderless segments 4px shorter than the requested size, and the on item as the same raised chip as the segmented Tabs indicator. bare drops the track so the segments can sit on a track the host already draws, such as a floating dock; the host supplies the tint and padding. spacing={n} separates the items by n times 4px as standalone Toggles with the pressed fill. Shared size, variant and orientation apply to the group; sizes follow Button."
    ],
    accessibility: [
      "Name the group and each item. Each item announces whether it is pressed, arrow keys move between items and disabled items stay unavailable."
    ],
    limitations: [
      "Single mode may report an empty string when deselected; multiple mode may report an empty array. Enforce any required choice in the host."
    ],
    examples: [
      {
        id: "default",
        title: "Single choice",
        module: "./examples/toggle-group/default.tsx",
        states: ["default", "keyboard"]
      },
      {
        id: "permissions",
        title: "Multiple choices",
        module: "./examples/toggle-group/permissions.tsx",
        states: ["controlled", "disabled", "keyboard"]
      }
    ],
    coverage: [
      {
        axis: "variant",
        expected: ["outline", "default", "ghost"],
        shown: [],
        omitted: [
          {
            value: "outline",
            reason: "The default. Both examples use it: joined bordered segments."
          },
          { value: "default", reason: "Alias of outline, as on Toggle." },
          {
            value: "ghost",
            reason:
              "Borderless segments for a toolbar that already frames them. The Toggle page shows the ghost paint."
          }
        ]
      },
      {
        axis: "size",
        expected: ["default", "sm", "md", "lg"],
        shown: [],
        omitted: [
          {
            value: "default",
            reason: "ToggleGroup uses the Button size scale. Both groups here are the 32px default."
          },
          { value: "sm", reason: "Alias of default, as on Button." },
          { value: "md", reason: "36px, the Button md geometry." },
          { value: "lg", reason: "40px, the Button lg geometry." }
        ]
      },
      {
        axis: "type",
        expected: ["single", "multiple"],
        shown: [
          { value: "single", exampleId: "default", label: "single" },
          { value: "multiple", exampleId: "permissions", label: "multiple" }
        ]
      },
      {
        axis: "orientation",
        expected: ["horizontal", "vertical"],
        shown: [{ value: "horizontal", exampleId: "default", label: "single" }],
        omitted: [
          {
            value: "vertical",
            reason: "The same joined segments stacked, for a narrow side panel."
          }
        ]
      },
      {
        axis: "state",
        expected: ["uncontrolled", "controlled", "disabled selected", "zero spacing", "spaced"],
        shown: [
          { value: "uncontrolled", exampleId: "default", label: "single" },
          { value: "controlled", exampleId: "permissions", label: "multiple" },
          { value: "disabled selected", exampleId: "permissions", label: "multiple" },
          { value: "zero spacing", exampleId: "default", label: "single" }
        ],
        omitted: [
          {
            value: "spaced",
            reason:
              "spacing={n} separates the items by n times 4px, each with its own corners. Use it only when the items are not one control."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Pass a string for single and an array for multiple, handle empty values deliberately and apply variant and size at the group owner."
      ],
      avoid: [
        "Use radio assumptions for a single group or erase a selected disabled option when another tool changes."
      ],
      decision:
        "Choose ToggleGroup to filter or format the content in place: a segmented All / Active / Failing filter, or a set of pressed flags. Use Tabs when each choice owns its own panel, RadioGroup for a required form value and ButtonGroup for one-time actions.",
      rules: [
        {
          id: "toggle-group-usage",
          when: "A single-choice pressed group can be toggled off.",
          do: "Handle the empty string as no pressed tool, or choose RadioGroup if one option must always remain selected.",
          avoid: "Assume single mode guarantees a required value.",
          reason:
            "Optional pressed tools and required form choices have different empty-state contracts.",
          evidence: [
            "src/components/v4/ui/toggle-group.tsx",
            "src/pages/design-system/examples/toggle-group/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Turn off the selected single-mode tool and change multiple-mode tools. Empty or array values remain deliberate host states rather than an assumed required radio choice."
          }
        }
      ],
      states: [
        {
          state: "multiple",
          guidance: "Store the array of pressed values without deriving unrelated permissions."
        },
        {
          state: "empty",
          guidance: "Keep the unpressed state meaningful and valid when the group allows it."
        }
      ],
      antiSlop: [
        {
          do: "Keep the tools close in purpose and label the group.",
          avoid: "Use pressed buttons as a substitute for every form select.",
          reason: "A compact toolbar is useful for repeated tools, not arbitrary long option lists."
        },
        {
          do: "Compare authored variants and sizes with the same short choices, then show single and multiple selection independently.",
          avoid: "Build every combination or silently erase a selected policy-disabled permission.",
          reason: "Comparable geometry and controlled selection are separate behaviors."
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
          "npm run ui:dev; open /design-system#toggle-group and verify the documented interaction."
      }
    ]
  }
] satisfies readonly ComponentDefinition[];
