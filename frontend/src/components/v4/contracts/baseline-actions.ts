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
      "src/components/v4/ui/button-geometry.module.css",
      "src/components/v4/ui/button.test.tsx",
      "src/components/v4/tokens.json"
    ],
    exports: ["Button", "buttonVariants"],
    referenceNames: ["Button"],
    behavior: [
      "Primary (and default, its alias) is the ink fill with an on-ink label at 600 for the one main action in a view or dialog; hover moves to text2. Accent keeps the light accent face (one yellow in both themes) with owned inset illumination and an on-accent label in both themes, for a page's one primary create action in its header or toolbar and for approval and grant moments, never as a second primary. Ghost hover is the shared hover overlay (ink at hover-mix: 6% light, 12% dark), so it shows on raised surfaces. destructive is the solid danger recipe: bad-fill fill and border with a white on-bad label at 600 in both themes, bad-hover on hover, and the neutral disabled control (line-soft fill, faint label) when disabled. link is ink text with a 1px underline at a 3px offset; hover moves to text2 with a 2px underline and never adds a background. underline hover makes a quiet link: no underline at rest, and the same underline on hover and on keyboard focus-visible; the default, always, keeps it at rest. Loading morphs the label into the spinner inside the same box: with loading set, the whole label group (icons included) fades, shrinks and blurs out on duration-moderate while the pixel Spinner fades in centered over it, and the reverse when loading ends. The idle spinner is absolutely positioned, so a button with loading={false} lays out exactly like one without it and never shifts or resizes; the spinner never sits beside an icon. While loading the accessible name stays, aria-busy is set and activation is inert. Reduced motion is a short opacity fade. Pressing never moves or resizes the box: the label and its icons scale to 0.97 inside it and spring back, the pressed fill stays on the box, and reduced motion keeps the fill only. The selected paint follows only selected (aria-pressed true), data-state on and aria-current page, never aria-expanded, so a disclosure button keeps aria-expanded and looks as it does at rest. A popup trigger (aria-haspopup) takes its open paint while its menu or popover is open, from Radix's data-state open, or from aria-expanded on that trigger because a wrapping Tooltip overwrites data-state. link has no control height or padding: its box is its text, it sits on the surrounding baseline, and only the focus ring extends past it. Native button and slot composition preserve interaction semantics.",
      "The text sizes are 32px (default, with sm as its alias), 36px (md) and 40px (lg), with 10, 14 and 16px insets and the shared 14px label. icon matches default at 32px and icon-lg matches lg at 40px; iconOnly makes any text size square. xs, icon-xs (24px) and icon-sm (28px) are nested and chrome sizes. icon-row is the table row action: a size-target-row (28px) box with a size-glyph (16px) glyph, separate from icon-sm so field and nested actions keep their 12 and 14px glyphs. Nested control actions consume the host slot instead of inheriting a standalone action's geometry. Size names do not guarantee a touch target.",
      "Every variant except link keeps the default cursor, also when asChild renders an anchor: its fill, border or hover ground already shows that it acts. link takes the pointer cursor, like any text link.",
      "layout trigger is for a Button that opens a menu, popover or picker and shows its current value: the label sits at the start and truncates with an ellipsis, and a 16px chevron (chev-down, or iconRight) sits at the end, muted on outline, secondary and ghost. Insets match SelectTrigger at each size (10, 12 and 14px at default, md and lg) with the same 6px gap, so a picker Button and a Select read as one family. Give it a width; without one it hugs its label.",
      "cornerBadge pins a small Badge to the top-right corner: its end edge sits on the button's end edge and its middle on the top border, so it straddles the border without changing the button's size or hit area. It takes no pointer events, stays put while the label presses or loads, and sits on a surface ground so a translucent tone never shows the border through it."
    ],
    accessibility: [
      "Use a real button for an action and asChild with an anchor for navigation. Name icon-only buttons. Native disabled removes activation, while loading remains focusable and exposes busy/disabled semantics.",
      "disabledReason disables the action without native disabled: the button sets aria-disabled, stays in the tab order, shows the reason in a Tooltip on hover and keyboard focus, and carries it as aria-description. Click, Enter, Space and form submission are blocked, so a submit Button with a reason never submits its form. It dims like native disabled, and the ink, accent and destructive variants keep their own disabled recipe.",
      "cornerBadge renders inside the button, so its text joins the accessible name after the label, as in Continue with Google Last used. Write it as a short word or two that reads well in that position.",
      "The rendered button defaults to type button, so a Button inside a form never submits it by accident. Set type submit on the one Button that submits; an explicit type always wins. With asChild, Button sets no type and forwards only the one you pass, so an anchor child never gets a type attribute."
    ],
    limitations: [
      "The owner runs the operation and updates loading. Button does not start requests, show result notifications or impose a destructive confirmation.",
      "Button has no read-only prop. Use disabled for unavailable actions, or show read-only content without an action.",
      "cornerBadge is not portaled: it overhangs the button's top edge by half the small Badge height (size-badge-sm / 2) and stays within its inline edges. An ancestor with overflow hidden clips that half unless it leaves that much room above the button. Pass a Badge with size sm; Button does not resize it.",
      "With disabledReason set the reason replaces any label tooltip. Do not wrap the Button in another Tooltip while it has a reason: pass the wrapper content only while the action is enabled, as in Tooltip content={reason ? undefined : label}."
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
        states: ["default", "loading", "disabled", "keyboard"]
      },
      {
        id: "composition",
        title: "Icons and links",
        module: "./examples/button/composition.tsx",
        states: ["default"]
      },
      {
        id: "form-type",
        title: "Inside a form",
        module: "./examples/button/form-type.tsx",
        states: ["default", "success"]
      },
      {
        id: "trigger-layout",
        title: "Trigger layout",
        module: "./examples/button/trigger-layout.tsx",
        states: ["default"]
      },
      {
        id: "corner-badge",
        title: "Corner badge",
        module: "./examples/button/corner-badge.tsx",
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
        axis: "link underline",
        expected: ["always", "hover"],
        shown: [
          { value: "always", exampleId: "default", label: "link" },
          { value: "hover", exampleId: "default", label: "link, underline on hover" }
        ]
      },
      {
        axis: "size",
        expected: [
          "xs",
          "sm",
          "default",
          "md",
          "lg",
          "icon-xs",
          "icon-sm",
          "icon",
          "icon-lg",
          "icon-row"
        ],
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
          },
          {
            value: "icon-row",
            reason:
              "28px target with a 16px glyph for table row actions. It only makes sense in a table's actions tail, the sticky last column, so the Table row actions example shows it."
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
          "disabled with reason",
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
          { value: "disabled with reason", exampleId: "states", label: "Disabled with reason" },
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
        "Choose emphasis with variant and geometry with size. default and primary share the ink fill and accent is the yellow fill for a page's create action; default and sm are size aliases. Give a pending action a leading icon when its label must stay visible while it works."
      ],
      avoid: [],
      decision:
        "Choose Button for an action. Use a native link for a destination, Toggle for a persistent pressed choice and Switch for an immediate setting.",
      rules: [
        {
          id: "button-usage",
          when: "A form has one save action and several supporting actions.",
          do: "Use the ink primary Button for Save changes, use outline or ghost for Review draft and Discard, and keep the button's size and name while saving.",
          avoid:
            "Give every action the strongest emphasis, paint Save changes with the accent, repaint the shared material in caller styles or replace Save changes with an unlabeled spinner.",
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
          do: "Use the supported size recipes for peer actions and keep the shared paint. Passing loading never changes padding, so pass it whenever the operation can become pending.",
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
        },
        {
          id: "button-quiet-link",
          when: "A link Button names a record inside a table row that opens it in a sheet or dialog, among many such names.",
          do: 'Pass variant="link" with underline="hover", so the name reads as plain text at rest and underlines on hover and keyboard focus.',
          avoid:
            "Underline every row's name at rest, or drop the link variant for a ghost or plain button that never shows it can be opened.",
          reason:
            "A column of underlined names turns the table into a wall of links; the quiet link keeps rows calm and still signals the target when the pointer or focus reaches it.",
          evidence: [
            "src/components/v4/ui/button.tsx",
            "src/pages/design-system/examples/button/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Hover and Tab to a row's name in a sheet-opening table: no underline at rest, an underline on hover and on keyboard focus."
          }
        },
        {
          id: "button-cursor",
          when: "A Button, Toggle or other styled control sits beside text links.",
          do: "Leave the cursor to the component: styled controls show the default cursor and only the link variant, text anchors, RowLink and CardLink show the pointer.",
          avoid:
            "Add cursor: pointer or a cursor-pointer class to a Button, a trigger or a Button that renders an anchor so it feels clickable.",
          reason:
            "The pointer marks a link. A styled control already reads as actionable through its grounds, and a pointer on it blurs which targets navigate.",
          evidence: [
            "src/components/v4/ui/button-geometry.module.css",
            "src/components/v4/ui/button-material.module.css"
          ],
          detect: {
            by: "review",
            how: "Hover each variant, including an asChild anchor: only link shows the pointer. npm run ui:lint (cursor-pointer) flags any cursor: pointer or cursor-pointer outside a link selector."
          }
        },
        {
          id: "button-row-icon-size",
          when: "An icon-only action sits in a table row, a field or a toolbar.",
          do: "Use icon-row for actions in a Table or DataTable row, in the actions tail (DataTable rowActions or RowActions). Keep icon-xs and icon-sm for actions nested in a field or block (InputGroup reveal and copy, Code and Snippet copy, a combobox clear) and for overlay chrome, and icon for a standalone toolbar action.",
          avoid:
            "Put icon-xs or icon-sm in a table row, or icon-row in a field slot, a toolbar or a dialog header.",
          reason:
            "Row actions share one glyph with the row's indicators and one target that fits the 40px row; field actions must fit their host slot, so resizing one must not move the other.",
          evidence: [
            "src/components/v4/ui/button.tsx",
            "src/components/v4/ui/button-geometry.module.css"
          ],
          detect: {
            by: "review",
            how: "Measure a row action and a field action on the same page: the row action is a 28px box with a 16px glyph, the field action keeps its 24 or 28px box with a 12 or 14px glyph."
          }
        },
        {
          id: "button-trigger-layout",
          when: "A Button opens a menu, popover or picker and shows a value with a chevron, such as an environment picker or an account menu.",
          do: 'Pass layout="trigger" and give the Button its width; the label starts, truncates and the chevron sits at the end.',
          avoid:
            'Put iconRight="chev-down" on a plain Button, or add justify-content: space-between to its class.',
          reason:
            "A plain Button centers its content, so in a fixed width the value and chevron float in the middle while a Select beside it starts its label at the edge.",
          evidence: [
            "src/components/v4/ui/button.tsx",
            "src/components/v4/ui/button-geometry.module.css",
            "src/pages/design-system/examples/button/trigger-layout.tsx"
          ],
          detect: {
            by: "review",
            how: "Open the menu in the Trigger layout example at a fixed width: the value starts at the same inset as the Select beside it and the chevron ends at its edge. npm run ui:lint (trigger-start-aligned) flags the plain Button form."
          }
        },
        {
          id: "button-disabled-reason",
          when: "An action is blocked by a permission, a plan or a missing prerequisite.",
          do: "Keep the Button in place and pass disabledReason with the reason in one sentence, such as Only project admins can rotate this key.",
          avoid:
            "Hide the action, pass disabled alone with no reason, or wrap a natively disabled Button in a span and a Tooltip to show why.",
          reason:
            "A natively disabled button cannot take focus, so keyboard users never reach a reason hung on it; disabledReason keeps it focusable and blocks activation in one place.",
          evidence: [
            "src/components/v4/ui/button.tsx",
            "src/components/v4/ui/button.test.tsx",
            "src/pages/design-system/examples/button/states.tsx"
          ],
          detect: {
            by: "test",
            test: "src/components/v4/ui/button.test.tsx",
            how: "Clicks a submit Button with a disabledReason inside a form; neither onClick nor the form's submit runs, and the button is focusable with aria-disabled and the reason as its aria-description."
          }
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
            "Pass disabledReason when the person can learn why the action is blocked; the Button stays focusable and its tooltip says why. Use native disabled only when the reason is already visible beside the control."
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
        command: "npm run dev; open /design-system#button and verify the documented interaction."
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
          "npm run dev; open /design-system#button-group and verify the documented interaction."
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
      "Pressed state does not save a preference by itself; the owner chooses whether the choice is immediate or local to a view.",
      "Migration: v3 Toggle is a Radix Switch with checked, defaultChecked and onCheckedChange; v4 Toggle is a pressed button. Port v3 Toggle to v4 Switch. The v4 Toggle types reject checked, defaultChecked and onCheckedChange, so swapping only the import fails to compile."
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
        },
        {
          id: "toggle-not-switch",
          when: "A v3 Toggle (an on/off setting switch) is ported to v4.",
          do: "Port it to Switch with the same checked and onCheckedChange props.",
          avoid:
            "Swap the import to the v4 Toggle, which is a pressed button with pressed and onPressedChange.",
          reason:
            "The names match but the components differ, so a setting would render as a toolbar button and silently drop its checked state.",
          evidence: [
            "src/components/v4/ui/toggle.tsx",
            "src/pages/design-system/examples/toggle/default.tsx"
          ],
          detect: {
            by: "test",
            test: "src/components/v4/ui/migration-traps.test.tsx",
            how: "A ts-expect-error on Toggle with checked and onCheckedChange; type:check fails if the type guard is removed."
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
        command: "npm run dev; open /design-system#toggle and verify the documented interaction."
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
      "Radix type=single uses a string and type=multiple uses a string array with onValueChange. Items are joined into one segmented control by default (spacing 0), drawn like segmented Tabs: a tint track with 2px inset, borderless segments 4px shorter than the requested size, and the on item as the same raised chip as the segmented Tabs indicator. bare drops the track so the segments can sit on a track the host already draws, such as a toolbar; the host supplies the tint and padding. spacing={n} separates the items by n times 4px as standalone Toggles with the pressed fill. Shared size, variant and orientation apply to the group; sizes follow Button.",
      "The group never shrinks below its items in a flex row (flex-shrink 0), so a sibling such as a full-width Select trigger takes the leftover space instead of sliding over the last segments.",
      "width sizes the group and its items together, as on Tabs: the default, content, fits the track to its items, and full stretches the track to its container and gives every horizontal item an equal share. There is no full-width track with content-width items (rule/tab-width)."
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
        axis: "width",
        expected: ["content", "full"],
        shown: [
          { value: "content", exampleId: "default", label: "single" },
          { value: "full", exampleId: "default", label: "single, full width" }
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
          "npm run dev; open /design-system#toggle-group and verify the documented interaction."
      }
    ]
  }
] satisfies readonly ComponentDefinition[];
