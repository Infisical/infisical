import type { ComponentDefinition } from "./types";

export const baselineOverlays = [
  {
    id: "alert-dialog",
    title: "Alert Dialog",
    group: "Overlays",
    summary: "Confirm an irreversible consequence before performing it.",
    sourceFiles: ["src/components/v4/ui/alert-dialog.tsx"],
    exports: [
      "AlertDialog",
      "AlertDialogAction",
      "AlertDialogCancel",
      "AlertDialogContent",
      "AlertDialogDescription",
      "AlertDialogFooter",
      "AlertDialogHeader",
      "AlertDialogMedia",
      "AlertDialogOverlay",
      "AlertDialogPortal",
      "AlertDialogTitle",
      "AlertDialogTrigger"
    ],
    referenceNames: ["AlertDialog"],
    behavior: [
      "Controlled open/onOpenChange or defaultOpen owns visibility. Action and Cancel are Radix close controls; an async operation must explicitly control closing while it runs.",
      "AlertDialog renders at most one lead tile. tone danger shows a 40px bad-bg tile with the trash icon; icon swaps the glyph and AlertDialogMedia replaces the tile entirely, tinted by tone. With tone neutral or no tone there is no automatic tile; an icon or AlertDialogMedia there gets the neutral tint tile. The destructive action is the solid danger Button: bad fill, on-bad text, the neutral disabled control when disabled.",
      "confirmText adds a mono field, labeled Type <name> to confirm and focused on open, above the footer; the action stays disabled until the field matches exactly.",
      "One pad (space-16) on all four sides. Header, body and footer stack with the content gap and no margins. The footer has no band or rule: the actions sit right-aligned on the panel. A failure shows as a bad Alert in the body above the footer.",
      "When AlertDialogHeader or AlertDialogFooter is a direct child, the lead tile, header and body share one scroll region with the edge fade, and the footer stays pinned below it; the footer's own pad is the space above the actions."
    ],
    accessibility: [
      "Title and Description name the alert dialog. Focus starts on Cancel and returns to the trigger on close. The dialog stays inside the viewport, and Escape inside an open editor closes that editor first."
    ],
    limitations: [
      "Action does not await a request or infer success; prevent its default close or control open while an async operation settles."
    ],
    examples: [
      {
        id: "default",
        title: "Confirmation states",
        module: "./examples/alert-dialog/default.tsx",
        states: ["default", "loading", "error", "keyboard"]
      },
      {
        id: "sizes",
        title: "Sizes",
        module: "./examples/alert-dialog/sizes.tsx",
        states: ["default"]
      },
      {
        id: "content",
        title: "Constrained content",
        module: "./examples/alert-dialog/content.tsx",
        states: ["overflow"]
      },
      {
        id: "confirm",
        title: "Type to confirm and tone",
        module: "./examples/alert-dialog/confirm.tsx",
        states: ["default", "disabled"]
      }
    ],
    coverage: [
      {
        axis: "AlertDialogContent.size",
        expected: ["default", "sm"],
        shown: [
          {
            value: "default",
            exampleId: "sizes",
            label: "default"
          },
          {
            value: "sm",
            exampleId: "sizes",
            label: "sm"
          }
        ]
      },
      {
        axis: "AlertDialogContent.tone",
        expected: ["danger", "neutral"],
        shown: [
          { value: "danger", exampleId: "confirm", label: "danger" },
          { value: "neutral", exampleId: "confirm", label: "neutral" }
        ]
      }
    ],
    guidance: {
      use: [
        "Control open state or prevent the Action default close, retain the resource and consequence text, and close only after the host confirms success."
      ],
      avoid: [
        "Assume AlertDialogAction waits for a promise or close the confirmation before a failure can be shown."
      ],
      decision:
        "Choose AlertDialog when a specific irreversible consequence needs confirmation. Use Dialog for editable tasks and an inline action for easily reversible work.",
      rules: [
        {
          id: "alert-dialog-usage",
          when: "Deleting a named resource requires an asynchronous request.",
          do: "Name the resource and consequence, offer Cancel before submission, and close only after the request succeeds. Keep cancellation available while pending only if the host can actually cancel the operation.",
          avoid:
            "Use a generic Are you sure prompt whose action closes before the request settles.",
          reason: "The user needs the exact consequence and a retry path when the deletion fails.",
          evidence: [
            "src/components/v4/ui/alert-dialog.tsx",
            "src/pages/design-system/examples/alert-dialog/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Confirm a failed asynchronous revocation; the dialog and error remain. Cancel works before submission, and pending cancellation is offered only if it actually stops the operation."
          }
        }
      ],
      states: [
        {
          state: "pending",
          guidance: "Control open state and prevent repeated destructive submission."
        },
        {
          state: "error",
          guidance: "Keep the dialog open with the failed action and recovery text."
        }
      ],
      antiSlop: [
        {
          do: "Label the action Delete connection or Revoke access.",
          avoid: "Label both trigger and confirmation Continue.",
          reason: "Vague labels hide which irreversible operation is being approved."
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
          "npm run dev; open /design-system#alert-dialog and verify the documented interaction."
      }
    ]
  },
  {
    id: "dialog",
    title: "Dialog",
    group: "Overlays",
    summary: "Edit or inspect a task in a modal with a title and description.",
    sourceFiles: ["src/components/v4/ui/dialog.tsx"],
    exports: [
      "Dialog",
      "DialogClose",
      "DialogContent",
      "DialogDescription",
      "DialogFooter",
      "DialogHeader",
      "DialogOverlay",
      "DialogPortal",
      "DialogSubheader",
      "DialogTitle",
      "DialogTrigger"
    ],
    referenceNames: ["Dialog"],
    behavior: [
      "open/onOpenChange or defaultOpen controls the Radix dialog. Trigger and Close compose native controls; scoped Content portals into V4Scope and caps its height at the viewport minus size-overlay-margin on each side.",
      "When DialogHeader, DialogSubheader or DialogFooter is a direct child, Content wraps the header and the other content in one scroll region with the edge fade, so the header scrolls away with the body. DialogFooter and the corner close stay outside that region and remain visible. DialogSubheader pins itself and the header above the scroll region and runs the full width, without the space reserved for the close button: use it for an artifact or legend the content needs, such as a step meter, a path preview or a filter row. Content without these slots renders unchanged.",
      "Corner close suits read-only or informational dialogs; footer close suits a dialog that ends in actions."
    ],
    accessibility: [
      "Title and Description name the dialog. Focus stays inside it and returns to the trigger. Escape inside an open editor closes that editor before the dialog."
    ],
    limitations: [
      "Dialog does not submit forms, await requests or choose success/error copy; the task owner controls those states and closure."
    ],
    examples: [
      {
        id: "default",
        title: "Editable form",
        module: "./examples/dialog/default.tsx",
        states: ["default", "controlled", "keyboard"]
      },
      {
        id: "variants",
        title: "Close controls",
        module: "./examples/dialog/variants.tsx",
        states: ["default"]
      },
      {
        id: "content",
        title: "Constrained history",
        module: "./examples/dialog/content.tsx",
        states: ["overflow"]
      }
    ],
    coverage: [
      {
        axis: "Content close control",
        expected: ["true", "false"],
        shown: [
          {
            value: "true",
            exampleId: "variants",
            label: "Corner close"
          },
          {
            value: "false",
            exampleId: "variants",
            label: "Footer close"
          }
        ]
      },
      {
        axis: "Footer close control",
        expected: ["false", "true"],
        shown: [
          {
            value: "false",
            exampleId: "variants",
            label: "Corner close"
          },
          {
            value: "true",
            exampleId: "variants",
            label: "Footer close"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Keep a named DialogTitle and useful description, let the task owner manage pending/error/open state and keep the failed draft inside the dialog."
      ],
      avoid: [
        "Wrap an async submit in an unconditional close control or remove the only close path without a deliberate pending policy."
      ],
      decision:
        "Choose Dialog for a focused editable task. Use AlertDialog for irreversible confirmation and Sheet for supporting details kept beside the page.",
      rules: [
        {
          id: "dialog-adverse-content",
          when: "A focused task includes a long history or a rejected form submission.",
          do: "Keep long content inside the viewport and retain the entered draft beside its error.",
          avoid:
            "Use a short happy-path fixture as the only sizing check or celebrate an unfulfilled save.",
          reason: "A modal must preserve the repair path even when content and text enlarge.",
          evidence: ["src/components/v4/ui/dialog.tsx"],
          detect: {
            by: "review",
            how: "Open the long history at 320px and 200% text, then reject a changed name and retry without losing the draft."
          }
        },
        {
          id: "dialog-usage",
          when: "Saving a modal form can fail.",
          do: "Keep the dialog open while saving, retain the draft on rejection, and place the error beside the form.",
          avoid: "Close on submit and show success before awaiting the result.",
          reason: "Closing loses the repair context and can falsely claim persistence.",
          evidence: [
            "src/components/v4/ui/dialog.tsx",
            "src/pages/design-system/examples/dialog/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Submit a failing save, correct it and retry. The draft survives failure, the dialog closes only on confirmed completion and focus returns to a logical target."
          }
        }
      ],
      states: [
        {
          state: "opening",
          guidance: "Give the dialog a specific title and an initial focus target."
        },
        {
          state: "dirty",
          guidance: "Make the host's dismissal policy explicit before a draft is discarded."
        }
      ],
      antiSlop: [
        {
          do: "Keep one focused task and its necessary context in the dialog.",
          avoid: "Recreate a full settings page with nested navigation inside a small modal.",
          reason: "A crowded modal makes orientation and recovery harder than a page would."
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
        command: "npm run dev; open /design-system#dialog and verify the documented interaction."
      }
    ]
  },
  {
    id: "hover-card",
    title: "Hover Card",
    group: "Overlays",
    summary: "Show supplementary information on hover or keyboard focus.",
    sourceFiles: ["src/components/v4/ui/hover-card.tsx"],
    exports: ["HoverCard", "HoverCardContent", "HoverCardTrigger"],
    referenceNames: ["HoverCard"],
    behavior: [
      "Radix HoverCard owns open/onOpenChange and hover delays; Content is scoped to V4Scope and accepts alignment and side offset."
    ],
    accessibility: [
      "HoverCard is supplementary preview content, not a keyboard task surface. Keep the trigger's destination and essential information available without opening it."
    ],
    limitations: [
      "Keep essential instructions and actions in persistent content rather than only in the hover card."
    ],
    examples: [
      {
        id: "default",
        title: "Linked connection",
        module: "./examples/hover-card/default.tsx",
        states: ["default"]
      },
      {
        id: "placements",
        title: "Placements",
        module: "./examples/hover-card/placements.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "Side",
        expected: ["top", "right", "bottom", "left"],
        shown: [
          {
            value: "top",
            exampleId: "placements",
            label: "top / start"
          },
          {
            value: "right",
            exampleId: "placements",
            label: "right / center"
          },
          {
            value: "bottom",
            exampleId: "placements",
            label: "bottom / end"
          },
          {
            value: "left",
            exampleId: "placements",
            label: "left / center"
          }
        ]
      },
      {
        axis: "Alignment",
        expected: ["start", "center", "end"],
        shown: [
          {
            value: "start",
            exampleId: "placements",
            label: "top / start"
          },
          {
            value: "center",
            exampleId: "placements",
            label: "right / center"
          },
          {
            value: "end",
            exampleId: "placements",
            label: "bottom / end"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Keep the link destination and necessary information in persistent content, then use HoverCard for optional supporting details."
      ],
      avoid: [
        "Put the only permission explanation or an essential edit action inside hover-only content."
      ],
      decision:
        "Choose HoverCard for optional supporting information about a visible link. Use Popover for an intentional interactive panel and Tooltip for a short control explanation.",
      rules: [
        {
          id: "hover-card-usage",
          when: "A linked identity has an email and role preview.",
          do: "Keep the visible link sufficient to identify the destination and show optional details in the preview.",
          avoid:
            "Hide required instructions, permission explanations or task controls only in the hover preview, or make its only destination a dead link.",
          reason:
            "Hover previews are supplemental and cannot be the only route to complete the task.",
          evidence: [
            "src/components/v4/ui/hover-card.tsx",
            "src/pages/design-system/examples/hover-card/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Use the linked object without opening its preview. Required identity, destination and task instructions remain available, and keyboard focus can reveal supplemental information."
          }
        }
      ],
      states: [
        {
          state: "focus",
          guidance: "Ensure the trigger remains a meaningful keyboard-accessible link."
        },
        {
          state: "missing-data",
          guidance: "Omit unknown metadata rather than presenting invented identity details."
        }
      ],
      antiSlop: [
        {
          do: "Keep the preview concise and tied to the linked object.",
          avoid: "Turn every noun on the page into a rich hover card.",
          reason: "Excess previews distract from reading and do not replace page hierarchy."
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
          "npm run dev; open /design-system#hover-card and verify the documented interaction."
      }
    ]
  },
  {
    id: "popover",
    title: "Popover",
    group: "Overlays",
    summary: "Show a small interactive panel anchored to its trigger.",
    sourceFiles: ["src/components/v4/ui/popover.tsx"],
    exports: [
      "Popover",
      "PopoverAnchor",
      "PopoverContent",
      "PopoverDescription",
      "PopoverHeader",
      "PopoverTitle",
      "PopoverTrigger"
    ],
    referenceNames: ["Popover"],
    behavior: [
      "Radix open/onOpenChange controls a trigger-anchored region with side/alignment placement. Content portals into V4Scope and honors descendant Escape ownership."
    ],
    accessibility: [
      "Name the popover's purpose through a heading or aria-label. Focus moves in when it opens and back to the trigger when it closes. Choose modal behavior for the task."
    ],
    limitations: [
      "PopoverTitle is a heading, not an automatic dialog label association; connect its ID when the content requires that name."
    ],
    examples: [
      {
        id: "default",
        title: "Connection hostname",
        module: "./examples/popover/default.tsx",
        states: ["default"]
      },
      {
        id: "placements",
        title: "Placements",
        module: "./examples/popover/placements.tsx",
        states: ["default"]
      },
      {
        id: "behavior",
        title: "Anchored form and nested dialog",
        module: "./examples/popover/behavior.tsx",
        states: ["controlled", "invalid", "keyboard"]
      }
    ],
    coverage: [
      {
        axis: "Side",
        expected: ["top", "right", "bottom", "left"],
        shown: [
          {
            value: "top",
            exampleId: "placements",
            label: "top / start"
          },
          {
            value: "right",
            exampleId: "placements",
            label: "right / center"
          },
          {
            value: "bottom",
            exampleId: "placements",
            label: "bottom / end"
          },
          {
            value: "left",
            exampleId: "placements",
            label: "left / center"
          }
        ]
      },
      {
        axis: "Alignment",
        expected: ["start", "center", "end"],
        shown: [
          {
            value: "start",
            exampleId: "placements",
            label: "top / start"
          },
          {
            value: "center",
            exampleId: "placements",
            label: "right / center"
          },
          {
            value: "end",
            exampleId: "placements",
            label: "bottom / end"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Keep an anchored optional task compact, named and reachable. Use Dialog when the task needs a larger focused workflow."
      ],
      avoid: [],
      decision:
        "Choose Popover for a small contextual picker or form anchored to its trigger. Use Tooltip for a short explanation and Dialog for a longer focused task.",
      rules: [
        {
          id: "popover-usage",
          when: "An anchored form can be invalid or dirty.",
          do: "Keep the form compact, show field errors in the panel, and let the host decide whether dismissal discards a draft.",
          avoid:
            "Hide a long multistep task inside a transient panel that closes on outside interaction.",
          reason: "The anchor helps context only while the task remains small and recoverable.",
          evidence: [
            "src/components/v4/ui/popover.tsx",
            "src/pages/design-system/examples/popover/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Open, validate and dismiss the contextual form with keyboard. Invalid values remain repairable and any unsaved dismissal follows an explicit host policy."
          }
        },
        {
          id: "popover-local-context",
          when: "A small optional task belongs beside a trigger.",
          do: "Use Popover for local nonmodal content, name interactive content explicitly where needed and keep its actions within available viewport space.",
          avoid:
            "Use it for a long irreversible workflow or assume PopoverTitle automatically supplies an accessible dialog name.",
          reason:
            "An anchored panel needs its own readable context and a deliberate name; a heading alone does not wire that relationship.",
          detect: {
            by: "review",
            how: "Open at each relevant viewport edge, use its controls and close with Escape. Content stays reachable and focus returns to the trigger without clipping the required actions."
          },
          evidence: [
            "src/components/v4/ui/popover.tsx",
            "src/pages/design-system/examples/popover/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "opening",
          guidance: "Move focus according to the task and retain the triggering object context."
        },
        {
          state: "error",
          guidance: "Keep failed input available for correction rather than closing the panel."
        }
      ],
      antiSlop: [
        {
          do: "Give the panel one specific purpose.",
          avoid: "Use a popover merely to add a second border around an already visible control.",
          reason: "An extra interaction should reveal useful context or reduce real density."
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
        command: "npm run dev; open /design-system#popover and verify the documented interaction."
      }
    ]
  },
  {
    id: "sheet",
    title: "Sheet",
    group: "Overlays",
    summary: "Inspect or edit a task in a side panel.",
    sourceFiles: ["src/components/v4/ui/sheet.tsx"],
    exports: [
      "Sheet",
      "SheetBody",
      "SheetClose",
      "SheetContent",
      "SheetDescription",
      "SheetFooter",
      "SheetHeader",
      "SheetSubheader",
      "SheetTitle",
      "SheetTrigger"
    ],
    referenceNames: ["Sheet"],
    behavior: [
      "SheetBody owns the shared body inset. When SheetHeader, SheetSubheader, SheetBody or SheetFooter is a direct child, Content wraps the header and body in one scroll region with the edge fade, so the header scrolls away with the body; SheetFooter and the corner close stay outside it and remain visible. SheetSubheader pins itself and the header above the scroll region and runs the full width, without the space reserved for the close button: use it for an artifact or legend the content needs, such as a path preview, a step meter or a filter row. Content without these slots, such as a Sidebar, renders unchanged. Each slot forwards a div ref and native props.",
      "Sheet composes Radix Dialog with side-specific Content and scoped portals. open/onOpenChange controls visibility; Close is an explicit dismiss action."
    ],
    accessibility: [
      "Provide SheetTitle and SheetDescription. Focus stays in the sheet and returns to the trigger. Escape inside an open editor closes the editor before the sheet."
    ],
    limitations: [
      "Sheet does not own request state or automatically preserve unsaved work; the host decides whether closure is allowed."
    ],
    examples: [
      {
        id: "default",
        title: "Connection details",
        module: "./examples/sheet/default.tsx",
        states: ["default"]
      },
      {
        id: "placements",
        title: "Sides",
        module: "./examples/sheet/placements.tsx",
        states: ["default"]
      },
      {
        id: "behavior",
        title: "Controlled long review",
        module: "./examples/sheet/behavior.tsx",
        states: ["controlled", "overflow"]
      },
      {
        id: "subheader",
        title: "Path preview subheader",
        module: "./examples/sheet/subheader.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "SheetContent.side",
        expected: ["top", "right", "bottom", "left"],
        shown: [
          {
            value: "top",
            exampleId: "placements",
            label: "top"
          },
          {
            value: "right",
            exampleId: "placements",
            label: "right"
          },
          {
            value: "bottom",
            exampleId: "placements",
            label: "bottom"
          },
          {
            value: "left",
            exampleId: "placements",
            label: "left"
          }
        ]
      },
      {
        axis: "Close control",
        expected: ["true", "false"],
        shown: [
          {
            value: "true",
            exampleId: "placements",
            label: "right"
          },
          {
            value: "false",
            exampleId: "behavior",
            label: "Done reviewing"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Choose the side from the task, provide a title and maintain explicit pending, error and unsaved-close policy in the host."
      ],
      avoid: [
        "Assume Sheet saves or preserves a draft, or remove all close paths to work around a request race."
      ],
      decision:
        "Choose Sheet for a supporting task or object detail alongside the current page. Use Dialog for a small centered task and a page for long independent work.",
      rules: [
        {
          id: "sheet-bounded-review",
          when: "A supporting detail panel has dense content.",
          do: "Keep the title and explicit footer dismissal reachable while the body scrolls.",
          avoid:
            "Add nested decorative panels or rely on a missing corner close button as the only exit.",
          reason: "A supporting task needs an obvious end without obscuring the parent context.",
          evidence: ["src/components/v4/ui/sheet.tsx"],
          detect: {
            by: "review",
            how: "Open the long controlled review in both themes, reach the last grant and close to the original trigger."
          }
        },
        {
          id: "sheet-usage",
          when: "A side panel contains unsaved changes.",
          do: "Keep the draft on a rejected save and let the host protect dismissal while dirty.",
          avoid: "Close on outside interaction and silently discard the only copy of the draft.",
          reason:
            "The supporting panel must not make ordinary dismissal a hidden destructive action.",
          evidence: [
            "src/components/v4/ui/sheet.tsx",
            "src/pages/design-system/examples/sheet/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Edit a draft, reject a save and attempt dismissal at a narrow viewport. The title/close control stay reachable and unsaved data is not silently discarded."
          }
        }
      ],
      states: [
        {
          state: "narrow",
          guidance: "Keep title, close action and body reachable within the viewport."
        },
        {
          state: "pending",
          guidance: "Show the actual pending operation and prevent duplicate submission."
        }
      ],
      antiSlop: [
        {
          do: "Keep the main object context visible in the panel heading.",
          avoid: "Open a second sheet for every nested detail.",
          reason: "Repeated panels obscure which object and draft the person is editing."
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
        command: "npm run dev; open /design-system#sheet and verify the documented interaction."
      }
    ]
  },
  {
    id: "tooltip",
    title: "Tooltip",
    group: "Overlays",
    summary: "Explain a control on hover and keyboard focus.",
    sourceFiles: ["src/components/v4/ui/tooltip.tsx"],
    exports: ["Tooltip", "TooltipContent", "TooltipProvider", "TooltipTrigger"],
    referenceNames: ["Tooltip"],
    behavior: [
      "The shortcut specimen owns a Mod+K binding scoped to its focused region. Its button and binding open the same local search, which filters fictional connections and exposes the selected record. Editing and composition keys remain with their controls.",
      "Tooltip opens after a hover delay and immediately from focus; side, alignment, wrapping and a displayed shortcut are explicit."
    ],
    accessibility: [
      "The trigger retains its own accessible name. Tooltip shortcut text describes a host binding; it does not register a hotkey."
    ],
    limitations: [
      "Tooltip content is supplementary text, not a place for focusable actions. A displayed shortcut does not register its binding."
    ],
    examples: [
      {
        id: "default",
        title: "Wrapped help and refresh",
        module: "./examples/tooltip/default.tsx",
        states: ["default"]
      },
      {
        id: "placements",
        title: "Placements",
        module: "./examples/tooltip/placements.tsx",
        states: ["default"]
      },
      {
        id: "parts",
        title: "Shortcut and controlled parts",
        module: "./examples/tooltip/parts.tsx",
        states: ["controlled", "keyboard"]
      }
    ],
    coverage: [
      {
        axis: "side",
        slot: "tooltip-content",
        expected: ["top", "right", "bottom", "left"],
        shown: [
          {
            value: "top",
            exampleId: "placements",
            label: "top"
          },
          {
            value: "right",
            exampleId: "placements",
            label: "right"
          },
          {
            value: "bottom",
            exampleId: "placements",
            label: "bottom"
          },
          {
            value: "left",
            exampleId: "placements",
            label: "left"
          }
        ]
      },
      {
        axis: "Alignment",
        expected: ["start", "center", "end"],
        shown: [
          {
            value: "start",
            exampleId: "placements",
            label: "top"
          },
          {
            value: "center",
            exampleId: "placements",
            label: "right"
          },
          {
            value: "end",
            exampleId: "placements",
            label: "bottom"
          }
        ]
      },
      {
        axis: "Wrap",
        expected: ["false", "true"],
        shown: [
          {
            value: "false",
            exampleId: "default",
            label: "Refresh"
          },
          {
            value: "true",
            exampleId: "default",
            label: "About read access"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Name the control independently, keep Tooltip text supplementary and show only shortcuts the host actually binds."
      ],
      avoid: ["Put buttons, essential errors or the only action name inside Tooltip content."],
      decision:
        "Choose Tooltip for a short supplemental control explanation. Use FieldDescription for required input guidance and Popover for interactive content.",
      rules: [
        {
          id: "tooltip-usage",
          when: "An icon-only action needs a discoverable description.",
          do: "Give the action its own accessible name and show the tooltip on focus as well as hover.",
          avoid:
            "Make the tooltip the icon's only programmatic label or put a required instruction only in hover text.",
          reason: "The action must remain understandable before or without the tooltip opening.",
          evidence: [
            "src/components/v4/ui/tooltip.tsx",
            "src/pages/design-system/examples/tooltip/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Focus the trigger without a pointer. Its accessible name works before the tooltip opens, and required instructions remain visible when tooltip content is absent."
          }
        }
      ],
      states: [
        {
          state: "focus",
          guidance: "Keep the same explanation available to keyboard users."
        },
        {
          state: "disabled",
          guidance: "Place essential disabled-state reasons in reachable nearby content."
        }
      ],
      antiSlop: [
        {
          do: "Explain an unfamiliar action or constraint in a few words.",
          avoid: "Repeat every visible button label in an identical tooltip.",
          reason: "Redundant popups interrupt reading without supplying new information."
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
        command: "npm run dev; open /design-system#tooltip and verify the documented interaction."
      }
    ]
  }
] satisfies readonly ComponentDefinition[];
