import type { ComponentDefinition } from "./types";

export const baselineContent = [
  {
    id: "accordion",
    title: "Accordion",
    group: "Data display",
    summary: "Reveal related sections without leaving the current context.",
    sourceFiles: ["src/components/v4/ui/accordion.tsx"],
    exports: ["Accordion", "AccordionContent", "AccordionItem", "AccordionTrigger"],
    referenceNames: ["Accordion"],
    behavior: [
      "Radix single mode uses a string value; multiple mode uses an array. onValueChange reports item values, and collapsible allows the open single item to close."
    ],
    accessibility: [
      "Each trigger is a button inside a heading and controls its own panel. Arrow keys, Home and End move between triggers."
    ],
    limitations: [
      "Disclosure does not persist a setting or validate its contents; the host owns those operations."
    ],
    examples: [
      {
        id: "default",
        title: "Connection settings",
        module: "./examples/accordion/default.tsx",
        states: ["default", "disabled"]
      },
      {
        id: "variants",
        title: "Variants",
        module: "./examples/accordion/variants.tsx",
        states: ["default"]
      },
      {
        id: "controlled",
        title: "Controlled open section",
        module: "./examples/accordion/controlled.tsx",
        states: ["default", "controlled"]
      }
    ],
    coverage: [
      {
        axis: "root type",
        expected: ["single", "multiple"],
        shown: [
          {
            value: "single",
            exampleId: "variants",
            label: "Single, noncollapsible"
          },
          {
            value: "multiple",
            exampleId: "variants",
            label: "Multiple, both open"
          }
        ]
      },
      {
        axis: "orientation",
        expected: ["vertical", "horizontal"],
        shown: [],
        omitted: [
          {
            value: "vertical",
            reason: "Changes arrow-key direction only, nothing visible."
          },
          {
            value: "horizontal",
            reason: "Changes arrow-key direction only, nothing visible."
          }
        ]
      },
      {
        axis: "disabled",
        expected: ["false", "true"],
        shown: [
          {
            value: "false",
            exampleId: "default",
            label: "Retention policy"
          },
          {
            value: "true",
            exampleId: "default",
            label: "Organization policy"
          }
        ]
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use stable item values and choose single or multiple mode from whether simultaneous reading is useful; allow long trigger text to wrap."
      ],
      avoid: [
        "Encode required form choices in open sections or hide an unresolved validation error only inside a closed panel."
      ],
      decision:
        "Choose Accordion for several independently useful disclosure sections. Use Collapsible for one optional region and Tabs for peer views.",
      rules: [
        {
          id: "accordion-usage",
          when: "A collapsed section contains invalid fields.",
          do: "Give each heading a distinct content name, reveal invalid content after submission and keep essential task instructions outside collapsed sections.",
          avoid: "Hide the only error explanation behind a closed Advanced panel.",
          reason:
            "People cannot repair a hidden field or complete a task from headings that conceal the instructions most of them need.",
          evidence: [
            "src/components/v4/ui/accordion.tsx",
            "src/pages/design-system/examples/accordion/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Submit invalid content inside a closed item; the item opens, its named heading remains locatable and the invalid field can receive focus."
          }
        }
      ],
      states: [
        {
          state: "single/multiple",
          guidance: "Choose single for one open section or multiple when users compare sections."
        },
        {
          state: "invalid",
          guidance: "Reveal invalid content and move focus to its field after submission."
        }
      ],
      antiSlop: [
        {
          do: "Write headings that identify the hidden content.",
          avoid: "Use a stack of identical More details headings.",
          reason: "Repeated headings make scanning and keyboard navigation ambiguous."
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
          "npm run ui:dev; open /design-system#accordion and verify the documented interaction."
      }
    ]
  },
  {
    id: "alert",
    title: "Alert",
    group: "Feedback",
    summary: "Explain a persistent result or problem next to the affected content.",
    sourceFiles: ["src/components/v4/ui/alert.tsx", "src/components/v4/ui/helpers.module.css"],
    exports: ["Alert", "AlertAction", "AlertDescription", "AlertTitle", "Banner"],
    referenceNames: ["Alert", "Banner"],
    behavior: [
      "Alert supports tone and dismissal for inline feedback. Banner represents a standing condition above related content."
    ],
    accessibility: [
      "Use readable text with the tone. Dismissal needs a named button and owner-controlled state when the notice can return."
    ],
    limitations: [
      "Dismissal calls onDismiss; the owner removes or restores the notice and performs any recovery action."
    ],
    examples: [
      {
        id: "default",
        title: "Status and recovery",
        module: "./examples/alert/default.tsx",
        states: ["default"]
      },
      {
        id: "variants",
        title: "Variants and actions",
        module: "./examples/alert/variants.tsx",
        states: ["default"]
      },
      {
        id: "banner",
        title: "Dismissible banner",
        module: "./examples/alert/banner.tsx",
        states: ["default", "controlled"]
      }
    ],
    coverage: [
      {
        axis: "variant",
        expected: ["default", "destructive"],
        shown: [
          {
            value: "default",
            exampleId: "variants",
            label: "default"
          },
          {
            value: "destructive",
            exampleId: "variants",
            label: "destructive"
          }
        ]
      },
      {
        axis: "tone",
        expected: ["neutral", "info", "ok", "warn", "bad"],
        shown: [
          {
            value: "neutral",
            exampleId: "default",
            label: "neutral"
          },
          {
            value: "info",
            exampleId: "default",
            label: "info"
          },
          {
            value: "ok",
            exampleId: "default",
            label: "ok"
          },
          {
            value: "warn",
            exampleId: "default",
            label: "warn"
          },
          {
            value: "bad",
            exampleId: "default",
            label: "bad"
          }
        ]
      },
      {
        axis: "actions",
        expected: ["action", "dismiss"],
        shown: [
          {
            value: "action",
            exampleId: "variants",
            label: "Review configuration"
          },
          {
            value: "dismiss",
            exampleId: "default",
            label: "Connection failed"
          }
        ]
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use a concise inline condition with a supported tone and only the recovery or dismissal actions that the host can perform."
      ],
      avoid: [],
      decision:
        "Choose Alert for a condition that remains relevant beside the affected content. Use Toast for a recent transient result and AlertDialog before an irreversible action.",
      rules: [
        {
          id: "alert-usage",
          when: "A connection remains unavailable after a failed attempt.",
          do: "State which connection failed and offer a retry or recovery action beside the explanation.",
          avoid: "Show a generic Something went wrong banner at the top of an unrelated page.",
          reason: "The location and named object explain what the action will repair.",
          evidence: [
            "src/components/v4/ui/alert.tsx",
            "src/pages/design-system/examples/alert/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Read the notice without its color. It still names the affected connection, current condition and available recovery, with no duplicate result announcement."
          }
        },
        {
          id: "alert-condition-and-recovery",
          when: "An inline condition needs an explanation or recovery action.",
          do: "Choose info, ok, warn or bad from the actual condition, name the affected resource and give any recovery action a real handler.",
          avoid:
            "Use a warning tone for ordinary metadata, repeat the same success in Alert and Toast, or dismiss a blocking condition without another visible explanation.",
          reason:
            "Persistent notices consume attention and must explain a real condition where it can be acted on.",
          detect: {
            by: "review",
            how: "Compare the notice with the current task state. Its tone, resource name, action and dismissal policy still make sense after failure and recovery."
          },
          evidence: [
            "src/components/v4/ui/alert.tsx",
            "src/pages/design-system/examples/alert/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "error",
          guidance: "Keep the condition visible until it clears or the owner dismisses it."
        },
        {
          state: "dismissed",
          guidance: "Remove the notice only when the owning state records dismissal."
        }
      ],
      antiSlop: [
        {
          do: "Use one notice for one actionable condition.",
          avoid: "Stack a success banner, success toast and green badge for one save.",
          reason: "Duplicate feedback competes with the task and repeats announcements."
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
        command: "npm run ui:dev; open /design-system#alert and verify the documented interaction."
      }
    ]
  },
  {
    id: "aspect-ratio",
    title: "Aspect Ratio",
    group: "Utilities",
    summary: "Keep a media or preview region at a defined width-to-height ratio.",
    sourceFiles: ["src/components/v4/ui/aspect-ratio.tsx"],
    exports: ["AspectRatio"],
    referenceNames: ["AspectRatio"],
    behavior: [
      "The ratio prop is width divided by height; Radix reserves that proportion while the outer container determines width."
    ],
    accessibility: [
      "The wrapper adds no image alternative. Give the actual image alt text or name the embedded preview."
    ],
    limitations: [
      "A fixed ratio can crop or letterbox media depending on the child's own object-fit behavior."
    ],
    examples: [
      {
        id: "default",
        title: "Wide and square media previews",
        module: "./examples/aspect-ratio/default.tsx",
        states: ["default", "controlled", "overflow"]
      },
      {
        id: "media",
        title: "Media ratios",
        module: "./examples/aspect-ratio/media.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "representative numeric ratios",
        expected: ["16:9", "1:1", "3:4"],
        shown: [
          {
            value: "16:9",
            exampleId: "media",
            label: "16:9"
          },
          {
            value: "1:1",
            exampleId: "media",
            label: "1:1"
          },
          {
            value: "3:4",
            exampleId: "media",
            label: "3:4"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Set ratio to width divided by height, constrain its outer width and choose the image fit policy from whether cropping is acceptable."
      ],
      avoid: [
        "Put instructions or form controls in a fixed-ratio box, or crop a meaningful diagram to fill an attractive shape."
      ],
      decision:
        "Choose AspectRatio for media with a known width-to-height shape. Use normal document flow for text, forms and resource details.",
      rules: [
        {
          id: "aspect-ratio-usage",
          when: "A preview loads after the surrounding page renders.",
          do: "Constrain the outer width, set ratio to width divided by height, and give the media its own alternative text.",
          avoid: "Set a fixed-ratio shell around text that must grow with zoom or translation.",
          reason: "The wrapper reserves geometry; it cannot make overflowing text readable.",
          evidence: [
            "src/components/v4/ui/aspect-ratio.tsx",
            "src/pages/design-system/examples/aspect-ratio/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Resize each media container before and after content loads; its width-to-height ratio remains correct and adjacent text can still wrap independently."
          }
        }
      ],
      states: [
        {
          state: "loading",
          guidance: "Reserve the same media area before and after the image arrives."
        },
        {
          state: "narrow",
          guidance: "Let the outer width shrink while the selected ratio remains constant."
        }
      ],
      antiSlop: [
        {
          do: "Choose a ratio from the actual media and show a readable caption or alternative.",
          avoid:
            "Force the same fixed media shape around forms, text cards and every product illustration.",
          reason:
            "A repeated shape can crop useful content or add empty space without serving the media."
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
          "npm run ui:dev; open /design-system#aspect-ratio and verify the documented interaction."
      }
    ]
  },
  {
    id: "avatar",
    title: "Avatar",
    group: "Data display",
    summary: "Identify people and show grouped participants.",
    sourceFiles: ["src/components/v4/ui/avatar.tsx", "src/components/v4/ui/helpers.module.css"],
    exports: [
      "Avatar",
      "AvatarBadge",
      "AvatarFallback",
      "AvatarGroup",
      "AvatarGroupCount",
      "AvatarImage",
      "Identity"
    ],
    referenceNames: ["Avatar", "Identity"],
    behavior: [
      "Avatar supports person, machine, agent and fallback identities, numeric size and optional status. Every kind shares one paint, a tint square with ink initials or icon and radius-control corners (square by default, 4px in soft mode); the initials or icon tell the kinds apart. Initials are 10, 12 and 14px at 24, 32 and 40px. The status dot is an 8px square outside the bottom corner with a 2px surface ring. AvatarGroup overlaps by 4px and exposes overflow, and Identity pairs a lead with text."
    ],
    accessibility: [
      "Provide an identity name or accessible label. Organizations use text or a neutral icon, never an invented avatar."
    ],
    limitations: [
      "Organization avatars are unsupported. Status is visual unless the owner supplies its meaning in the accessible label or nearby text."
    ],
    examples: [
      {
        id: "default",
        title: "Group",
        module: "./examples/avatar/default.tsx",
        states: ["default", "overflow"]
      },
      {
        id: "variants",
        title: "Kinds",
        module: "./examples/avatar/variants.tsx",
        states: ["default"]
      },
      {
        id: "sizes",
        title: "Sizes",
        module: "./examples/avatar/sizes.tsx",
        states: ["default"]
      },
      {
        id: "states",
        title: "Status",
        module: "./examples/avatar/states.tsx",
        states: ["default"]
      },
      {
        id: "identity",
        title: "Identity",
        module: "./examples/avatar/identity.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "kind",
        expected: ["person", "machine", "agent", "fallback"],
        shown: [
          { value: "person", exampleId: "variants", label: "person" },
          { value: "machine", exampleId: "variants", label: "machine" },
          { value: "agent", exampleId: "variants", label: "agent" },
          { value: "fallback", exampleId: "variants", label: "fallback" }
        ]
      },
      {
        axis: "size",
        expected: ["sm", "default", "lg"],
        shown: [
          { value: "sm", exampleId: "sizes", label: "sm" },
          { value: "default", exampleId: "sizes", label: "default" },
          { value: "lg", exampleId: "sizes", label: "lg" }
        ]
      },
      {
        axis: "status",
        expected: ["ok", "warn", "off", "absent"],
        shown: [
          { value: "ok", exampleId: "states", label: "ok" },
          { value: "warn", exampleId: "states", label: "warn" },
          { value: "off", exampleId: "states", label: "off" },
          { value: "absent", exampleId: "variants", label: "person" }
        ]
      },
      {
        axis: "content state",
        expected: ["loaded image", "failed image", "decorative fallback"],
        shown: [],
        omitted: [
          {
            value: "loaded image",
            reason:
              "AvatarImage fills the same square, clipped to its corners. The fixtures hold no real photo, and a drawn stand-in would look like a defect."
          },
          {
            value: "failed image",
            reason:
              "A failed AvatarImage falls back to the initials, which every example already shows."
          },
          {
            value: "decorative fallback",
            reason: "aria-hidden on an Avatar next to a visible name. It paints the same as person."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Choose the real person, machine, agent or fallback kind, keep a visible name beside Identity and make status meaning available in text."
      ],
      avoid: [
        "Give an organization a person avatar, invent initials for anonymous identities or use a colored status dot as the only explanation."
      ],
      decision:
        "Choose Avatar for people, machine identities or agents with an explicit kind, and Identity when name and metadata belong together. Identify an organization with its name and a neutral building icon.",
      rules: [
        {
          id: "avatar-usage",
          when: "Participants in the same member group have missing photos or different identity kinds.",
          do: "Keep names or meaningful fallbacks and make person, machine or agent kind explicit. Keep size and status differences tied to supplied meaning.",
          avoid:
            "Invent a profile photo or imply ownership, presence or rank through arbitrary size and colored dots.",
          reason:
            "Identity styling must preserve recognition without creating a false relationship or status.",
          evidence: [
            "src/components/v4/ui/avatar.tsx",
            "src/pages/design-system/examples/avatar/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Remove all photos from a participant group. Names or meaningful fallbacks still identify members, and group size/status differences correspond to supplied data."
          }
        }
      ],
      states: [
        {
          state: "image-error",
          guidance: "Keep readable fallback initials and the visible name."
        },
        {
          state: "group",
          guidance: "Show the remaining participant count when the visible group is bounded."
        }
      ],
      antiSlop: [
        {
          do: "Use consistent avatar sizes within one participant group.",
          avoid: "Make one participant larger or add status dots without a real distinction.",
          reason: "Unequal geometry implies a rank or presence state the data may not contain."
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
        command: "npm run ui:dev; open /design-system#avatar and verify the documented interaction."
      }
    ]
  },
  {
    id: "badge",
    title: "Badge",
    group: "Data display",
    summary: "Show a short status, version or environment beside its object.",
    sourceFiles: ["src/components/v4/ui/badge.tsx", "src/components/v4/ui/helpers.module.css"],
    exports: ["Badge", "badgeVariants", "Count"],
    referenceNames: ["Badge", "Count"],
    behavior: [
      "tone is the one paint axis: outline, soft, solid and accent for metadata and emphasis; ok, warn, bad and info for status. variant is deprecated and maps to a tone (default solid, secondary soft, destructive bad, the rest outline). Badges are 20px (md) or 16px (sm) with radius-sm corners (square by default, 4px in soft mode) and one weight, and take an optional dot and mono content. Count is a separate 20px number chip: accent for attention, ink for weight and neutral for counts inside tabs and lists."
    ],
    accessibility: ["Tone must accompany readable text; a dot alone does not explain status."],
    limitations: [
      "Badge and Count display caller-supplied values; they do not fetch or calculate status."
    ],
    examples: [
      {
        id: "default",
        title: "Tones",
        module: "./examples/badge/default.tsx",
        states: ["default"]
      },
      {
        id: "sizes",
        title: "Sizes",
        module: "./examples/badge/sizes.tsx",
        states: ["default"]
      },
      {
        id: "count",
        title: "Count",
        module: "./examples/badge/count.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "variant",
        expected: ["default", "secondary", "destructive", "outline", "ghost", "link"],
        shown: [],
        omitted: [
          { value: "default", reason: 'Deprecated alias of tone="solid". Use tone.' },
          { value: "secondary", reason: 'Deprecated alias of tone="soft". Use tone.' },
          { value: "destructive", reason: 'Deprecated alias of tone="bad". Use tone.' },
          { value: "outline", reason: 'Deprecated alias of tone="outline". Use tone.' },
          {
            value: "ghost",
            reason: 'Deprecated. It rendered as plain text, so it now maps to tone="outline".'
          },
          {
            value: "link",
            reason: 'Deprecated. It rendered as plain text, so it now maps to tone="outline".'
          }
        ]
      },
      {
        axis: "tone",
        expected: ["outline", "soft", "ok", "warn", "bad", "info", "solid", "accent"],
        shown: [
          { value: "outline", exampleId: "default", label: "outline" },
          { value: "soft", exampleId: "default", label: "soft" },
          { value: "ok", exampleId: "default", label: "ok" },
          { value: "warn", exampleId: "default", label: "warn" },
          { value: "bad", exampleId: "default", label: "bad" },
          { value: "info", exampleId: "default", label: "info" },
          { value: "solid", exampleId: "default", label: "solid" },
          { value: "accent", exampleId: "default", label: "accent" }
        ]
      },
      {
        axis: "size",
        expected: ["sm", "md"],
        shown: [
          { value: "sm", exampleId: "sizes", label: "sm" },
          { value: "md", exampleId: "sizes", label: "md" }
        ]
      },
      {
        axis: "Count.tone",
        expected: ["accent", "ink", "neutral"],
        shown: [
          { value: "accent", exampleId: "count", label: "accent" },
          { value: "ink", exampleId: "count", label: "ink" },
          { value: "neutral", exampleId: "count", label: "neutral" }
        ]
      },
      {
        axis: "composition",
        expected: ["dot", "no dot", "link", "mono"],
        shown: [
          { value: "dot", exampleId: "default", label: "ok" },
          { value: "no dot", exampleId: "default", label: "outline" },
          { value: "mono", exampleId: "default", label: "soft" }
        ],
        omitted: [
          {
            value: "link",
            reason:
              "asChild renders the Badge as the caller's anchor with the same tone paint. Badges label things; a destination belongs in a link."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use Badge's sm or md treatment for compact status, Count for totals and quiet text for ordinary metadata."
      ],
      avoid: [],
      decision:
        "Choose Badge for compact object status and Count for a numeric total. Use Alert for an explanation and Button for an action.",
      rules: [
        {
          id: "badge-usage",
          when: "An environment, version and operational status appear beside the same resource.",
          do: "Use neutral text or a neutral Badge for category metadata. Pair status tones and dots with a real state label and its consequence.",
          avoid:
            "Color every environment or version as success, warning or failure without a corresponding state.",
          reason:
            "Category and operational state answer different questions; coloring both as status hides the exception that needs attention.",
          evidence: [
            "src/components/v4/ui/badge.tsx",
            "src/pages/design-system/examples/badge/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Inspect labels with hue removed. Status remains understandable, while environment and version metadata do not falsely look like success or failure."
          }
        },
        {
          id: "badge-status-versus-action",
          when: "A row includes status and a numeric total.",
          do: "Use Badge for a concise supplied status and Count for the number; keep an action in Button or a real slotted link.",
          avoid:
            "Render every metadata value as a colored badge, use a badge as an unlabeled button or invent Healthy from an absent status.",
          reason:
            "Status emphasis should distinguish meaningful conditions rather than decorate every fact.",
          detect: {
            by: "review",
            how: "Read the row without color. Status text, totals and actions remain distinct, and each status can be traced to the supplied data."
          },
          evidence: [
            "src/components/v4/ui/badge.tsx",
            "src/pages/design-system/examples/badge/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "long-label",
          guidance: "Shorten the status term rather than shrinking its text."
        },
        {
          state: "zero",
          guidance: "Show a zero count only when zero is meaningful to the task."
        }
      ],
      antiSlop: [
        {
          do: "Reserve status tones for actual status.",
          avoid: "Add matching bright badges to every navigation label and heading.",
          reason:
            "Repeated emphasis removes the distinction between ordinary metadata and an exception."
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
        command: "npm run ui:dev; open /design-system#badge and verify the documented interaction."
      }
    ]
  },
  {
    id: "calendar",
    title: "Calendar",
    group: "Data display",
    summary: "Choose a date with keyboard-accessible month navigation.",
    sourceFiles: ["src/components/v4/ui/calendar.tsx"],
    exports: ["Calendar", "CalendarDayButton"],
    referenceNames: ["Calendar"],
    behavior: [
      "Calendar forwards the installed DayPicker selection modes. In optional single mode selected is Date or undefined and onSelect may clear it; optional multiple mode uses Date[] or undefined, and range mode uses DateRange or undefined, including an unfinished range."
    ],
    accessibility: [
      "Each day is announced by its full date, and arrow keys move between days. Label what the date is for and show a readable summary of the selected date."
    ],
    limitations: [
      "Date values do not define a storage format. The host owns timezone and date-only serialization; do not derive a local calendar date by slicing a UTC ISO timestamp. Accept optional empty and incomplete range states."
    ],
    examples: [
      {
        id: "default",
        title: "Single date and date range",
        module: "./examples/calendar/default.tsx",
        states: ["default", "disabled", "controlled"]
      }
    ],
    coverage: [
      {
        axis: "selection mode",
        expected: ["single", "multiple", "range", "none"],
        shown: [
          {
            value: "single",
            exampleId: "default",
            label: "Single expiry date"
          },
          {
            value: "range",
            exampleId: "default",
            label: "Date range with month and year controls"
          }
        ],
        omitted: [
          {
            value: "multiple",
            reason:
              'mode="multiple" looks like single with several days marked and selected is a Date[]; the behavior notes cover it.'
          },
          {
            value: "none",
            reason:
              "Without a mode the grid is the same and days are not selectable, so there is nothing to see."
          }
        ]
      },
      {
        axis: "caption layout",
        expected: ["label", "dropdown", "dropdown-months", "dropdown-years"],
        shown: [
          {
            value: "label",
            exampleId: "default",
            label: "Single expiry date"
          },
          {
            value: "dropdown",
            exampleId: "default",
            label: "Date range with month and year controls"
          }
        ],
        omitted: [
          {
            value: "dropdown-months",
            reason: "Same as dropdown with only the month select; the year stays a plain label."
          },
          {
            value: "dropdown-years",
            reason: "Same as dropdown with only the year select; the month stays a plain label."
          }
        ]
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Handle undefined and partial range values explicitly and serialize date-only choices using the host's intended calendar and timezone."
      ],
      avoid: [
        "Slice a UTC timestamp to derive the displayed local day or treat the first range click as a complete booking."
      ],
      decision:
        "Choose Calendar for day-based selection with spatial date context. Use a text field for free-form input and a separate time control for an instant.",
      rules: [
        {
          id: "calendar-usage",
          when: "The task asks for an expiry date rather than an exact UTC timestamp.",
          do: "Construct local calendar Dates and show a readable selected date; require both ends before submitting a range.",
          avoid:
            "Parse YYYY-MM-DD as an implicit UTC instant or treat a start-only range as complete.",
          reason:
            "Timezone conversion can shift a calendar day, and a partial range has no end date.",
          evidence: [
            "src/components/v4/ui/calendar.tsx",
            "src/pages/design-system/examples/calendar/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Choose a local date and a start-only range across timezone settings; the calendar day remains the intended day and incomplete ranges cannot be submitted as complete."
          }
        }
      ],
      states: [
        {
          state: "empty",
          guidance: "Describe what date to choose without inventing a default expiry."
        },
        {
          state: "range",
          guidance: "Announce the start-only state and request an end date before submission."
        }
      ],
      antiSlop: [
        {
          do: "Display constraints such as weekdays and the selected result beside the calendar.",
          avoid: "Decorate arbitrary dates with status dots that have no legend or task meaning.",
          reason: "Unexplained marks create false availability or activity information."
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
          "npm run ui:dev; open /design-system#calendar and verify the documented interaction."
      }
    ]
  },
  {
    id: "card",
    title: "Card",
    group: "Data display",
    summary: "Group one resource or task with its own header, content and actions.",
    sourceFiles: ["src/components/v4/ui/card.tsx"],
    exports: [
      "Card",
      "CardAction",
      "CardContent",
      "CardDescription",
      "CardFooter",
      "CardHeader",
      "CardTitle"
    ],
    referenceNames: ["Card"],
    behavior: [
      "Card offers framed and plain shells, a flush body and named title/description/media/action/footer slots. Framed sits on the pop ground and plain on the page, both inside one line border. Title, description, body and footer share one text column; media hangs to its left and the action centres on the title line."
    ],
    accessibility: [
      "Choose the heading level through the composed title; actions remain native controls with their own names."
    ],
    limitations: [
      "Card adds no navigation role and does not choose a semantic heading level for title content."
    ],
    examples: [
      {
        id: "default",
        title: "Framed and plain",
        module: "./examples/card/default.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "variant",
        expected: ["framed", "plain"],
        shown: [
          {
            value: "framed",
            exampleId: "default",
            label: "framed"
          },
          {
            value: "plain",
            exampleId: "default",
            label: "plain"
          }
        ]
      },
      {
        axis: "size",
        expected: ["default", "sm"],
        shown: [],
        omitted: [
          {
            value: "default",
            reason: "Both cards use the default size; their captions name the variant."
          },
          {
            value: "sm",
            reason: "sm only narrows every inset from 16px to 12px; it adds no part or behavior."
          }
        ]
      },
      {
        axis: "composition",
        expected: ["flush", "parts"],
        shown: [
          {
            value: "parts",
            exampleId: "default",
            label: "plain"
          }
        ],
        omitted: [
          {
            value: "flush",
            reason:
              "flush only removes the body inset so a full-bleed table or list can bring its own; without that content it looks like framed."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use plain or framed treatment for a distinct resource or task, with explicit content and action slots. Keep continuous sections open."
      ],
      avoid: [],
      decision:
        "Choose Card when one resource or task has its own heading, content and actions. Use plain sections for a continuous form and List for comparable rows.",
      rules: [
        {
          id: "card-usage",
          when: "A resource card contains an Edit action and other independent controls.",
          do: "Keep navigation on the title link and actions on their own buttons.",
          avoid: "Make the whole card a button that contains nested links, switches or buttons.",
          reason: "Nested interactive targets create conflicting click and keyboard behavior.",
          evidence: [
            "src/components/v4/ui/card.tsx",
            "src/pages/design-system/examples/card/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Tab through a card containing a title link and secondary controls; each target works separately and the card shell does not create a competing nested action."
          }
        },
        {
          id: "card-surface-and-heading",
          when: "The same task can use plain or framed Card treatment.",
          do: "Keep the title's semantic rank and content meaning unchanged across variants, and use the named header, body, action and footer slots for aligned content.",
          avoid:
            "Make a framed title tiny uppercase metadata, add another padded wrapper inside every body or turn the entire card into a click target containing buttons.",
          reason:
            "Framing groups a task; it must not change hierarchy, double content insets or create nested interactions.",
          detect: {
            by: "review",
            how: "Compare convenience props and explicit parts with identical content in plain and framed treatments. Title rank, content edges and action access stay consistent at narrow width."
          },
          evidence: [
            "src/components/v4/ui/card.tsx",
            "src/pages/design-system/examples/card/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "empty",
          guidance: "Use a concise explanation inside the content area rather than an empty shell."
        },
        {
          state: "overflow",
          guidance: "Let text and actions wrap without hiding the resource name."
        }
      ],
      antiSlop: [
        {
          do: "Group one coherent task per card.",
          avoid: "Wrap every label and metric in separate bordered cards.",
          reason: "Excess shells hide the page hierarchy and waste space in dense work."
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
        command: "npm run ui:dev; open /design-system#card and verify the documented interaction."
      }
    ]
  },
  {
    id: "carousel",
    title: "Carousel",
    group: "Data display",
    summary: "Browse a finite set of related panels with explicit previous and next controls.",
    sourceFiles: ["src/components/v4/ui/carousel.tsx"],
    exports: [
      "Carousel",
      "CarouselApi",
      "CarouselContent",
      "CarouselItem",
      "CarouselNext",
      "CarouselPrevious",
      "useCarousel"
    ],
    referenceNames: ["Carousel"],
    behavior: [
      "Embla owns scroll position and reports its API through setApi. orientation chooses horizontal or vertical movement; previous/next disabled state follows the current scroll bounds."
    ],
    accessibility: [
      "The wrapper and slides expose carousel/slide descriptions. Arrow handling follows orientation and leaves editable fields, composite controls and modified keys alone; navigation buttons remain explicit."
    ],
    limitations: [
      "Autoplay is not enabled by the wrapper; any supplied plugin and its pause controls belong to the host."
    ],
    examples: [
      {
        id: "default",
        title: "Manual slide navigation",
        module: "./examples/carousel/default.tsx",
        states: ["default"]
      },
      {
        id: "multiple",
        title: "Multiple visible updates and current position",
        module: "./examples/carousel/multiple.tsx",
        states: ["default", "keyboard"]
      }
    ],
    coverage: [
      {
        axis: "orientation",
        expected: ["horizontal", "vertical"],
        shown: [
          {
            value: "horizontal",
            exampleId: "default",
            label: "Environment history"
          }
        ],
        omitted: [
          {
            value: "vertical",
            reason:
              "Vertical movement swaps the scroll axis and the control positions; it adds no behavior the horizontal examples hide."
          }
        ]
      },
      {
        axis: "loop",
        expected: ["true", "false"],
        shown: [
          {
            value: "true",
            exampleId: "default",
            label: "Environment history"
          },
          {
            value: "false",
            exampleId: "multiple",
            label: "4 local environment updates"
          }
        ]
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      },
      {
        axis: "visible slides",
        expected: ["one", "multiple"],
        shown: [
          {
            value: "one",
            exampleId: "default",
            label: "Environment history"
          },
          {
            value: "multiple",
            exampleId: "multiple",
            label: "4 local environment updates"
          }
        ]
      },
      {
        axis: "host item count",
        expected: ["zero", "single", "multiple"],
        shown: [
          {
            value: "multiple",
            exampleId: "multiple",
            label: "4 local environment updates"
          }
        ],
        omitted: [
          {
            value: "zero",
            reason:
              "The host decides what an empty collection shows; the carousel renders its own slides only."
          },
          {
            value: "single",
            reason: "A single slide is the multiple-slide case with nothing to scroll to."
          }
        ]
      },
      {
        axis: "position source",
        expected: ["selected API snap"],
        shown: [
          {
            value: "selected API snap",
            exampleId: "multiple",
            label: "Position 1 of 3"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Show an honest empty result, derive position and previous/next availability from the carousel API, and keep all essential information outside hidden slides."
      ],
      avoid: [
        "Invent a slide count, enable an action past a nonlooping bound or place required form steps in slides."
      ],
      decision:
        "Choose Carousel for optional browsing through a bounded set of previews. Use a list or grid when people must compare items or complete every step.",
      rules: [
        {
          id: "carousel-usage",
          when: "Not all preview slides fit at once.",
          do: "Keep Previous and Next controls visible and identify the current slide or item.",
          avoid: "Put a required input or the only recovery action on an offscreen slide.",
          reason: "Hidden slides are easy to miss and make task completion depend on discovery.",
          evidence: [
            "src/components/v4/ui/carousel.tsx",
            "src/pages/design-system/examples/carousel/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Use only keyboard and visible previous/next controls to inspect every slide; end controls report their boundaries and no required task depends on an unseen slide."
          }
        }
      ],
      states: [
        {
          state: "boundary",
          guidance: "Disable unavailable previous or next actions at the ends."
        },
        {
          state: "narrow",
          guidance:
            "Keep controls within the available layout and preserve access to slide content."
        }
      ],
      antiSlop: [
        {
          do: "Use manual navigation for optional preview media.",
          avoid: "Auto-advance a resource or setup carousel on a timer.",
          reason: "Automatic movement changes reading and focus context without a request."
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
          "npm run ui:dev; open /design-system#carousel and verify the documented interaction."
      }
    ]
  },
  {
    id: "chart",
    title: "Chart",
    group: "Data display",
    summary: "Present numeric data with a shared legend and tooltip contract.",
    sourceFiles: ["src/components/v4/ui/chart.tsx"],
    exports: [
      "ChartConfig",
      "ChartContainer",
      "ChartLegend",
      "ChartLegendContent",
      "ChartStyle",
      "ChartTooltip",
      "ChartTooltipContent"
    ],
    referenceNames: ["Chart"],
    behavior: [
      "ChartContainer provides Recharts responsive sizing and a ChartConfig mapping series keys to labels, icons and color or light/dark values. Tooltip and legend content consume that context."
    ],
    accessibility: [
      "Provide an equivalent text summary for decisions that cannot be read from the chart alone."
    ],
    limitations: ["A chart tooltip does not replace an accessible data summary."],
    examples: [
      {
        id: "default",
        title: "Daily request counts with exact values",
        module: "./examples/chart/default.tsx",
        states: ["default"]
      },
      {
        id: "variants",
        title: "Series and tooltip",
        module: "./examples/chart/variants.tsx",
        states: ["default"]
      },
      {
        id: "states",
        title: "States",
        module: "./examples/chart/states.tsx",
        states: ["loading", "empty", "error"]
      }
    ],
    coverage: [
      {
        axis: "tooltip indicator",
        expected: ["dot", "line", "dashed", "none"],
        shown: [
          {
            value: "dot",
            exampleId: "variants",
            label: "Two series with the tooltip held open on Tuesday"
          }
        ],
        omitted: [
          {
            value: "line",
            reason:
              "The tooltip appears only on hover, so a static page holds one open and shows dot. line swaps the swatch beside each tooltip row for a narrow bar."
          },
          {
            value: "dashed",
            reason: "Hover-only, like line. dashed draws the swatch as a dashed bar."
          },
          {
            value: "none",
            reason:
              "hideIndicator removes the swatch from the tooltip, which is only visible on hover."
          }
        ]
      },
      {
        axis: "identity",
        expected: ["single series", "multiple series"],
        shown: [
          {
            value: "single series",
            exampleId: "default",
            label: "Requests per day"
          },
          {
            value: "multiple series",
            exampleId: "variants",
            label: "Two series with the tooltip held open on Tuesday"
          }
        ]
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      },
      {
        axis: "host data lifecycle",
        expected: ["pending", "empty", "failed", "recovered", "loaded", "completed"],
        shown: [
          {
            value: "pending",
            exampleId: "states",
            label: "Loading request counts"
          },
          {
            value: "empty",
            exampleId: "states",
            label: "No requests yet"
          },
          {
            value: "failed",
            exampleId: "states",
            label: "Request counts unavailable"
          }
        ],
        omitted: [
          {
            value: "recovered",
            reason:
              "Request lifecycle transitions belong to the host. The Human page compares loading, empty and error presentations directly."
          },
          {
            value: "loaded",
            reason:
              "Request lifecycle transitions belong to the host. The Human page compares loading, empty and error presentations directly."
          },
          {
            value: "completed",
            reason:
              "Request lifecycle transitions belong to the host. The Human page compares loading, empty and error presentations directly."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use ChartConfig to keep numeric series identity, units and accessible explanations stable across the data lifecycle."
      ],
      avoid: [],
      decision:
        "Choose Chart to compare numeric quantities or trends. Use Table for exact row inspection and include a text summary when values inform a decision.",
      rules: [
        {
          id: "chart-usage",
          when: "A bar chart compares request counts across days.",
          do: "Show the quantity and unit, a truthful scale, readable labels, and exact values outside pointer-only tooltips.",
          avoid: "Plot unlabeled bars with no scale or use color as the only series identifier.",
          reason: "Without units and exact values the visual cannot support a reliable comparison.",
          evidence: [
            "src/components/v4/ui/chart.tsx",
            "src/pages/design-system/examples/chart/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Read the chart without hover or hue. The metric, unit, baseline, series identities and exact values required for the comparison are still available."
          }
        },
        {
          id: "chart-comparable-scale",
          when: "Bars compare the same quantity across categories.",
          do: "Use a common zero baseline and the same unit; keep labels and exact values available when hover is unavailable.",
          avoid:
            "Start similar bar panels at unrelated nonzero baselines or change the unit without naming it.",
          reason:
            "Bar length encodes magnitude. Inconsistent scales can make a small difference look large.",
          evidence: [
            "src/components/v4/ui/chart.tsx",
            "src/pages/design-system/examples/chart/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Compare the plotted lengths with their stated values and baseline; switching off hover or color does not remove the values needed for the decision."
          }
        },
        {
          id: "chart-data-meaning",
          when: "Numeric data changes between pending, empty, failed and loaded states.",
          do: "Keep series labels and semantic colors stable in ChartConfig, include units and an accessible summary, and show each data lifecycle truthfully.",
          avoid:
            "Plot placeholder zeros as actual observations, recolor series by array index or rely on hover alone for a consequential value.",
          reason:
            "A polished plot can still misrepresent missing data or reverse the meaning of a series.",
          detect: {
            by: "review",
            how: "Compare the summary, legend, units and supplied observations after reload and failure. Missing observations are not reported as measured zero and exact values remain available outside hover."
          },
          evidence: [
            "src/components/v4/ui/chart.tsx",
            "src/pages/design-system/examples/chart/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "empty",
          guidance:
            "Say that no observations match the period instead of drawing zero bars for unknown data."
        },
        {
          state: "loading",
          guidance:
            "Keep the chart region stable and distinguish pending data from a genuine zero count."
        }
      ],
      antiSlop: [
        {
          do: "Use a consistent scale, restrained series palette and a visible unit.",
          avoid:
            "Add decorative curves, perspective or color variation that changes no data distinction.",
          reason:
            "The visual encoding should support a comparison rather than imply extra categories or precision."
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
        command: "npm run ui:dev; open /design-system#chart and verify the documented interaction."
      }
    ]
  },
  {
    id: "collapsible",
    title: "Collapsible",
    group: "Utilities",
    summary: "Show optional details from a single trigger.",
    sourceFiles: ["src/components/v4/ui/collapsible.tsx"],
    exports: ["Collapsible", "CollapsibleContent", "CollapsibleTrigger"],
    referenceNames: ["Collapsible"],
    behavior: [
      "open/onOpenChange controls one disclosure; defaultOpen provides local initial state. Trigger toggles Content through the shared Radix root."
    ],
    accessibility: [
      "Use a named trigger button. It announces whether the region is open and which region it controls, and the content stays ordinary content rather than a menu."
    ],
    limitations: [
      "Collapsible coordinates one region; use Accordion when several sections need a shared single/multiple value contract."
    ],
    examples: [
      {
        id: "default",
        title: "Connection details",
        module: "./examples/collapsible/default.tsx",
        states: ["default"]
      },
      {
        id: "states",
        title: "Controlled and disabled states",
        module: "./examples/collapsible/states.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "state",
        expected: ["uncontrolled", "controlled", "disabled", "forceMount"],
        shown: [
          {
            value: "uncontrolled",
            exampleId: "default",
            label: "View connection details"
          },
          {
            value: "controlled",
            exampleId: "states",
            label: "Controlled, retained draft"
          },
          {
            value: "disabled",
            exampleId: "states",
            label: "Disabled"
          },
          {
            value: "forceMount",
            exampleId: "states",
            label: "Controlled, retained draft"
          }
        ]
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Keep Trigger and Content under the same Collapsible root, name the trigger for its content and choose controlled state when the host must coordinate closure."
      ],
      avoid: [
        "Use the open boolean as the value of a saved setting or add decorative plus/minus glyphs with no working trigger."
      ],
      decision:
        "Choose Collapsible for one optional detail region. Use Accordion for several related sections and Switch for a saved boolean setting.",
      rules: [
        {
          id: "collapsible-usage",
          when: "A concise summary has supporting diagnostic detail.",
          do: "Keep the main task understandable while closed, use the disclosure for one optional detail and return focus before hiding a focused descendant.",
          avoid:
            "Hide prerequisites or the only recovery instructions merely to make the page shorter, or make opening details mutate a saved preference.",
          reason:
            "Disclosure reduces visible secondary content; it must not make essential work depend on discovering hidden instructions.",
          evidence: [
            "src/components/v4/ui/collapsible.tsx",
            "src/pages/design-system/examples/collapsible/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Read the page with the region closed. The main task remains understandable, and opening or closing details does not mutate a saved setting or lose a focused draft."
          }
        }
      ],
      states: [
        {
          state: "closed",
          guidance: "Keep the trigger visible and the hidden content out of the tab order."
        },
        {
          state: "invalid",
          guidance:
            "Reveal the region if it contains the field a submission requires the person to repair."
        }
      ],
      antiSlop: [
        {
          do: "Hide genuinely secondary detail behind a named trigger.",
          avoid: "Collapse every paragraph into More controls to make a page appear shorter.",
          reason: "Repeated disclosure raises the cost of reading ordinary content."
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
          "npm run ui:dev; open /design-system#collapsible and verify the documented interaction."
      }
    ]
  },
  {
    id: "empty-state",
    title: "Empty",
    group: "Feedback",
    summary: "Explain why a collection has no items and how to create one.",
    sourceFiles: ["src/components/v4/ui/empty.tsx"],
    exports: [
      "Empty",
      "EmptyContent",
      "EmptyDescription",
      "EmptyHeader",
      "EmptyMedia",
      "EmptyTitle",
      "EmptyState"
    ],
    referenceNames: ["EmptyState"],
    behavior: [
      "EmptyState composes title, description, icon and action slots in default or compact form; the retained Empty parts support a custom arrangement."
    ],
    accessibility: [
      "Use a meaningful heading and a named native action. The empty container does not automatically announce asynchronous changes."
    ],
    limitations: [
      "The caller distinguishes an empty result from loading, failure and missing permission; EmptyState does not fetch data."
    ],
    examples: [
      {
        id: "default",
        title: "No connections and a creation entry point",
        module: "./examples/empty-state/default.tsx",
        states: ["default", "controlled"]
      },
      {
        id: "variants",
        title: "Variants and data states",
        module: "./examples/empty-state/variants.tsx",
        states: ["default"]
      },
      {
        id: "parts",
        title: "Compose an empty connection collection",
        module: "./examples/empty-state/parts.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "EmptyState.variant",
        expected: ["default", "compact"],
        shown: [
          {
            value: "default",
            exampleId: "variants",
            label: "default"
          },
          {
            value: "compact",
            exampleId: "variants",
            label: "compact"
          }
        ]
      },
      {
        axis: "EmptyMedia.variant",
        expected: ["default", "icon"],
        shown: [
          {
            value: "default",
            exampleId: "parts",
            label: "default"
          },
          {
            value: "icon",
            exampleId: "parts",
            label: "icon"
          }
        ]
      },
      {
        axis: "data state",
        expected: ["first use", "no matches", "request failure", "result after clear"],
        shown: [
          {
            value: "first use",
            exampleId: "variants",
            label: "No connections yet"
          },
          {
            value: "no matches",
            exampleId: "variants",
            label: "No matching connections"
          },
          {
            value: "request failure",
            exampleId: "variants",
            label: "Connections could not load"
          },
          {
            value: "result after clear",
            exampleId: "variants",
            label: "1 connection"
          }
        ]
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Distinguish first use, no matches, missing permission and request failure; choose an action that resolves that specific condition."
      ],
      avoid: [
        "Show Create your first item after a failed request or repeat a large illustration and paragraph in every small empty region."
      ],
      decision:
        "Choose EmptyState to explain why a collection has no rows. Use an error notice for a failed request and a loading state while the result is unknown.",
      rules: [
        {
          id: "empty-state-usage",
          when: "A filtered collection contains no matching rows.",
          do: "Say that no results match and offer Clear filters when it can help.",
          avoid:
            "Show a first-use Create resource prompt for a failed request or a filtered result.",
          reason:
            "First use, a filtered result and a failed request require different next actions. A polished empty shell cannot establish which cause occurred.",
          evidence: [
            "src/components/v4/ui/empty.tsx",
            "src/pages/design-system/examples/empty-state/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Compare initial-empty, filtered-empty, loading and failure content. Each states the established cause and offers only an applicable next action."
          }
        }
      ],
      states: [
        {
          state: "first-use",
          guidance: "Explain what the collection holds and offer the permitted creation action."
        },
        {
          state: "no-results",
          guidance:
            "Keep filter context visible and offer a reset rather than implying all data is absent."
        }
      ],
      antiSlop: [
        {
          do: "Use the smallest useful explanation and one relevant next action.",
          avoid: "Add a large celebratory illustration and several unrelated calls to action.",
          reason:
            "The empty region should help the person resume work rather than compete with the page."
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
          "npm run ui:dev; open /design-system#empty-state and verify the documented interaction."
      }
    ]
  },
  {
    id: "item",
    title: "Item",
    group: "Data display",
    summary: "Arrange one object with its title, description, media and actions.",
    sourceFiles: [
      "src/components/v4/ui/item.tsx",
      "src/components/v4/ui/item.module.css",
      "src/components/v4/ui/helpers.module.css"
    ],
    exports: [
      "Item",
      "ItemActions",
      "ItemContent",
      "ItemDescription",
      "ItemFooter",
      "ItemGroup",
      "ItemHeader",
      "ItemMedia",
      "ItemSeparator",
      "ItemTitle",
      "Media",
      "Tile"
    ],
    referenceNames: ["Item", "Media", "Tile"],
    behavior: [
      "Item composes rows with title, media, metadata, actions, error/unread states and actions below the text. ItemGroup keeps the requested semantic wrapper; Tile is a native selected button."
    ],
    accessibility: [
      "Make only actionable rows interactive. Name a selected Tile and preserve aria-pressed instead of adding click handlers to a generic div."
    ],
    limitations: [
      "ItemGroup supplies list/listitem structure and preserves slotted links; selection, unread counts and operations remain caller-owned."
    ],
    examples: [
      {
        id: "default",
        title: "Unread rows, errors and a selectable provider",
        module: "./examples/item/default.tsx",
        states: ["default"]
      },
      {
        id: "variants",
        title: "Variants, sizes and states",
        module: "./examples/item/variants.tsx",
        states: ["default"]
      },
      {
        id: "composition",
        title: "Parts and media",
        module: "./examples/item/composition.tsx",
        states: ["default"]
      },
      {
        id: "tiles",
        title: "Selectable tile and media",
        module: "./examples/item/tiles.tsx",
        states: ["default", "controlled"]
      }
    ],
    coverage: [
      {
        axis: "variant",
        expected: ["default", "outline", "muted"],
        shown: [
          {
            value: "default",
            exampleId: "variants",
            label: "default"
          },
          {
            value: "outline",
            exampleId: "variants",
            label: "outline"
          },
          {
            value: "muted",
            exampleId: "variants",
            label: "muted"
          }
        ]
      },
      {
        axis: "size",
        expected: ["default", "md", "sm", "xs"],
        shown: [
          {
            value: "default",
            exampleId: "variants",
            label: "default, md"
          },
          {
            value: "md",
            exampleId: "variants",
            label: "default, md",
            aliasOf: "default"
          },
          {
            value: "sm",
            exampleId: "variants",
            label: "sm"
          },
          {
            value: "xs",
            exampleId: "variants",
            label: "xs"
          }
        ]
      },
      {
        axis: "state",
        expected: ["unread", "resolved", "error", "selected", "disabled"],
        shown: [
          {
            value: "unread",
            exampleId: "default",
            label: "Deployment service"
          },
          {
            value: "resolved",
            exampleId: "variants",
            label: "Resolved, full text"
          },
          {
            value: "error",
            exampleId: "default",
            label: "Token needs attention"
          },
          {
            value: "selected",
            exampleId: "tiles",
            label: "Machine identity"
          },
          {
            value: "disabled",
            exampleId: "variants",
            label: "Disabled selection"
          }
        ]
      },
      {
        axis: "Media.tone",
        expected: ["ok", "warn", "bad", "info"],
        shown: [
          {
            value: "ok",
            exampleId: "variants",
            label: "ok"
          },
          {
            value: "warn",
            exampleId: "variants",
            label: "warn"
          },
          {
            value: "bad",
            exampleId: "variants",
            label: "bad"
          },
          {
            value: "info",
            exampleId: "variants",
            label: "info"
          }
        ]
      },
      {
        axis: "Media.size",
        expected: ["sm", "md"],
        shown: [
          {
            value: "sm",
            exampleId: "composition",
            label: "sm"
          },
          {
            value: "md",
            exampleId: "composition",
            label: "md"
          }
        ]
      },
      {
        axis: "ItemMedia.variant",
        expected: ["default", "icon", "image"],
        shown: [
          {
            value: "default",
            exampleId: "composition",
            label: "default"
          },
          {
            value: "icon",
            exampleId: "composition",
            label: "icon"
          },
          {
            value: "image",
            exampleId: "composition",
            label: "image"
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use Item for one rich object with named content slots. Choose List when collection identity and selection need a shared owner."
      ],
      avoid: [],
      decision:
        "Choose Item for one object with rich title, metadata, media and actions. Use List for a managed collection and DataTable for column comparison.",
      rules: [
        {
          id: "item-usage",
          when: "A row has both a main destination and secondary controls.",
          do: "Use a native title link or button for the main action and a separately named target for each secondary action.",
          avoid: "Wrap the complete row in a button containing other buttons or links.",
          reason:
            "Distinct native targets let people open, select and act on an object without one click triggering a different action.",
          evidence: [
            "src/components/v4/ui/item.tsx",
            "src/pages/design-system/examples/item/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Tab through the item's main action and its secondary controls; each has a distinct name and activating one does not trigger another."
          }
        },
        {
          id: "item-content-and-actions",
          when: "An object preview includes title, metadata and independent actions.",
          do: "Use title, description, badge, meta and actions slots; choose actionsPlacement=below when neighboring content needs more width.",
          avoid:
            "Concatenate a title and count into an anonymous string or slot a whole row into a link that contains another action button.",
          reason:
            "Explicit slots preserve readable relationships and prevent nested interactive targets.",
          detect: {
            by: "review",
            how: "Compare long titles, metadata and actions at narrow width. Each action remains independently reachable and selected or unread treatment follows actual host state."
          },
          evidence: [
            "src/components/v4/ui/item.tsx",
            "src/pages/design-system/examples/item/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "error",
          guidance:
            "Place the error with the affected item rather than replacing unrelated list content."
        },
        {
          state: "long-title",
          guidance:
            "Choose truncation only when the full identifier remains available through an intentional route."
        }
      ],
      antiSlop: [
        {
          do: "Allocate media, metadata and actions according to the object's task.",
          avoid: "Populate every slot with an icon, badge and decorative description by default.",
          reason:
            "Optional slots should carry information, not force every object into a noisy template."
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
        command: "npm run ui:dev; open /design-system#item and verify the documented interaction."
      }
    ]
  },
  {
    id: "progress",
    title: "Progress",
    group: "Feedback",
    summary: "Expose determinate or indeterminate progress with numeric semantics.",
    sourceFiles: ["src/components/v4/ui/progress.tsx", "src/components/v4/ui/helpers.module.css"],
    exports: ["Progress", "ProgressSteps"],
    referenceNames: ["Progress", "ProgressSteps"],
    behavior: [
      "Progress clamps its ARIA value while preserving explicit over-limit copy. It supports automatic tone, indeterminate activity and a ProgressSteps companion."
    ],
    accessibility: [
      "Name the operation. Indeterminate progress omits a value, and visible over-limit copy explains a value beyond the bound."
    ],
    limitations: [
      "The owner supplies measured progress; indeterminate mode communicates activity without estimating completion or elapsed time."
    ],
    examples: [
      {
        id: "default",
        title: "Bar and stages",
        module: "./examples/progress/default.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "tone",
        expected: ["ink", "warn", "bad", "auto"],
        shown: [],
        omitted: [
          {
            value: "ink",
            reason: "The bar above uses ink; its caption names the measure, not the tone."
          },
          {
            value: "warn",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "warn".'
          },
          {
            value: "bad",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "bad".'
          },
          {
            value: "auto",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "auto".'
          }
        ]
      },
      {
        axis: "boundary",
        expected: ["0", "79", "80", "100", "112", "indeterminate"],
        shown: [],
        omitted: [
          {
            value: "indeterminate",
            reason:
              'value={null} shows a moving band with no number; the progress fixture test renders it as "Checking connection".'
          },
          {
            value: "0",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "Usage 0%".'
          },
          {
            value: "79",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "Usage 79%".'
          },
          {
            value: "80",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "Usage 80%".'
          },
          {
            value: "100",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "Usage 100%".'
          },
          {
            value: "112",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "Usage 112%".'
          }
        ]
      },
      {
        axis: "steps",
        expected: ["first", "middle", "last", "complete"],
        shown: [],
        omitted: [
          {
            value: "first",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "First stage".'
          },
          {
            value: "middle",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "Middle stage".'
          },
          {
            value: "last",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "Last stage".'
          },
          {
            value: "complete",
            reason:
              'Cut to keep the page to the essentials; the progress fixture test renders it as "Complete".'
          }
        ]
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use determinate progress for measured units and indeterminate activity when the host cannot report completion."
      ],
      avoid: [],
      decision:
        "Choose Progress for measurable completion or an explicitly indeterminate operation. Use Spinner when only pending activity is known and ProgressSteps for named stages.",
      rules: [
        {
          id: "progress-usage",
          when: "The operation reports a completed count and total.",
          do: "Derive value from those counts and expose a readable unit, such as 32 of 80 records.",
          avoid:
            "Animate a timer from zero toward 99 percent when the operation reports no completion data.",
          reason:
            "A percentage claims measurable completion. Unknown duration needs an honest pending state rather than a timer that stalls near completion.",
          evidence: [
            "src/components/v4/ui/progress.tsx",
            "src/pages/design-system/examples/progress/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Inspect determinate value/max and an unknown-duration state. Numeric completion derives from real completed work, and unknown progress has no invented percentage."
          }
        },
        {
          id: "progress-measured-not-estimated",
          when: "A task can report completed units or only pending activity.",
          do: "Supply measured value and max when known, label the quantity and use indeterminate mode when completion is unknown.",
          avoid:
            "Animate a made-up percentage toward completion, infer an error from a high value alone or announce completion before the host settles.",
          reason:
            "A progress indicator represents data about real work rather than decoration or a timer.",
          detect: {
            by: "review",
            how: "Test zero, completion, out-of-range input and indeterminate work. The displayed quantity follows supplied measurements and success follows actual completion."
          },
          evidence: [
            "src/components/v4/ui/progress.tsx",
            "src/pages/design-system/examples/progress/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "indeterminate",
          guidance: "Use the indeterminate state and explain what is pending."
        },
        {
          state: "complete",
          guidance:
            "Report completion from the actual operation result, not merely a full-looking bar."
        }
      ],
      antiSlop: [
        {
          do: "Show progress near the work it describes.",
          avoid: "Add multiple progress bars for one operation without distinct units.",
          reason: "Duplicate indicators make it unclear which measure determines completion."
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
          "npm run ui:dev; open /design-system#progress and verify the documented interaction."
      }
    ]
  },
  {
    id: "resizable",
    title: "Resizable",
    group: "Utilities",
    summary: "Resize adjacent panels using a separator handle.",
    sourceFiles: ["src/components/v4/ui/resizable.tsx"],
    exports: ["ResizablePanelGroup", "ResizablePanel", "ResizableHandle"],
    referenceNames: ["Resizable"],
    behavior: [
      "Group forwards the installed panel library's orientation and layout callbacks. Panels accept defaultSize/minSize/maxSize; Separator provides drag and keyboard resize behavior."
    ],
    accessibility: [
      "Keep the handle focusable with a visible focus state, announcing its current size and the panel it resizes. Give panel contents useful headings."
    ],
    limitations: [
      "The host owns layout persistence and content adaptation. Installed v4 panel sizes use pixels for numbers and explicit units for percentages, such as '40%'."
    ],
    examples: [
      {
        id: "default",
        title: "Keyboard and pointer panel sizing",
        module: "./examples/resizable/default.tsx",
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
            exampleId: "default",
            label: "horizontal"
          },
          {
            value: "vertical",
            exampleId: "default",
            label: "vertical"
          }
        ]
      },
      {
        axis: "handle",
        expected: ["grip", "no grip", "disabled"],
        shown: [
          {
            value: "grip",
            exampleId: "default",
            label: "horizontal"
          }
        ],
        omitted: [
          {
            value: "no grip",
            reason: "Dropping the grip leaves the same one-pixel divider and drag target."
          },
          {
            value: "disabled",
            reason: "A disabled handle is the divider without drag or keyboard resizing."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Give panel sizes explicit units, choose minimums from usable content and keep the handle keyboard reachable."
      ],
      avoid: [
        "Treat numeric sizes as percentages, persist impossible values or shrink a form until its actions become unreachable."
      ],
      decision:
        "Choose Resizable for adjacent work areas that remain usable at their minimum sizes. Use a responsive Grid when the user does not need manual resizing.",
      rules: [
        {
          id: "resizable-usage",
          when: "A split should start at half width and stop at one fifth.",
          do: "Use explicit percentage strings for percentage constraints and choose minimum sizes from the real content; verify both panels at each bound.",
          avoid: "Copy numeric defaultSize 50 and minSize 20 from an older percentage-based API.",
          reason:
            "The installed API treats numbers as pixels. Even correct percentages can leave a panel too narrow for its title or controls.",
          evidence: [
            "src/components/v4/ui/resizable.tsx",
            "src/pages/design-system/examples/resizable/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Move the divider to both minimum bounds using keyboard and pointer, then resize the viewport. Both panels and their labels remain readable at those permitted sizes."
          }
        }
      ],
      states: [
        {
          state: "minimum",
          guidance: "Keep the content usable at each permitted limit."
        },
        {
          state: "keyboard",
          guidance: "Retain a discoverable handle and verify keyboard resizing as well as dragging."
        }
      ],
      antiSlop: [
        {
          do: "Add a resize handle only when changing the split helps the work.",
          avoid: "Make every card edge draggable because the library supports it.",
          reason: "Unnecessary handles add interaction without a useful layout choice."
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
          "npm run ui:dev; open /design-system#resizable and verify the documented interaction."
      }
    ]
  },
  {
    id: "scroll-area",
    title: "Scroll Area",
    group: "Utilities",
    summary: "Scroll constrained content with a styled scrollbar.",
    sourceFiles: ["src/components/v4/ui/scroll-area.tsx"],
    exports: ["ScrollArea", "ScrollBar"],
    referenceNames: ["ScrollArea"],
    behavior: [
      "Radix ScrollArea wraps a native scrolling viewport and a vertical scrollbar; additional ScrollBar parts can request a horizontal orientation."
    ],
    accessibility: [
      "Keep all content and controls in the viewport reachable. A named, focusable scroll region is appropriate when users must scroll it with the keyboard."
    ],
    limitations: [
      "The viewport must be bounded by its layout to scroll; this component neither virtualizes rows nor fetches more content."
    ],
    examples: [
      {
        id: "default",
        title: "Scroll a bounded version history",
        module: "./examples/scroll-area/default.tsx",
        states: ["default"]
      },
      {
        id: "variants",
        title: "Visibility and axes",
        module: "./examples/scroll-area/variants.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "type",
        expected: ["auto", "always", "scroll", "hover"],
        shown: [
          {
            value: "auto",
            exampleId: "variants",
            label: "auto"
          },
          {
            value: "always",
            exampleId: "variants",
            label: "always"
          },
          {
            value: "scroll",
            exampleId: "variants",
            label: "scroll"
          },
          {
            value: "hover",
            exampleId: "variants",
            label: "hover"
          }
        ]
      },
      {
        axis: "axis",
        expected: ["vertical", "horizontal", "both"],
        shown: [
          {
            value: "vertical",
            exampleId: "variants",
            label: "auto"
          },
          {
            value: "horizontal",
            exampleId: "variants",
            label: "Both axes"
          },
          {
            value: "both",
            exampleId: "variants",
            label: "Both axes"
          }
        ]
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Bound the viewport through layout, choose the required scroll axis and keep keyboard access to content beyond the initial view."
      ],
      avoid: [
        "Add ScrollArea to an unbounded region expecting it to fetch, virtualize or prevent page overflow automatically."
      ],
      decision:
        "Choose ScrollArea for one bounded long region whose surroundings must stay visible. Use ordinary page flow for main reading content.",
      rules: [
        {
          id: "scroll-area-usage",
          when: "A version list must stay within a fixed-height panel.",
          do: "Set a real height on the region and use the wrapper's built-in vertical scrollbar.",
          avoid:
            "Insert a second vertical ScrollBar inside ScrollArea or nest several scrolling shells around the same list.",
          reason: "Duplicate and nested scrollbars obscure which region will move.",
          evidence: [
            "src/components/v4/ui/scroll-area.tsx",
            "src/pages/design-system/examples/scroll-area/default.tsx"
          ],
          detect: {
            by: "review",
            how: "With scrollbars always visible, reach the final row by wheel, keyboard and touch. One intended region scrolls without duplicate bars or whole-page horizontal overflow."
          }
        }
      ],
      states: [
        {
          state: "overflow",
          guidance: "Ensure the last row remains reachable by wheel, touch and keyboard."
        },
        {
          state: "short-content",
          guidance: "Let a short list remain quiet without implying hidden rows."
        }
      ],
      antiSlop: [
        {
          do: "Constrain only the region that needs independent scrolling.",
          avoid: "Put a scrollbar on every card and paragraph to force equal heights.",
          reason: "The page becomes harder to navigate without preserving useful context."
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
          "npm run ui:dev; open /design-system#scroll-area and verify the documented interaction."
      }
    ]
  },
  {
    id: "separator",
    title: "Separator",
    group: "Data display",
    summary: "Separate adjacent groups visually or semantically.",
    sourceFiles: ["src/components/v4/ui/separator.tsx"],
    exports: ["Separator"],
    referenceNames: ["Separator"],
    behavior: [
      "Separator supports soft, labeled and vertical boundaries. It separates content without adding a new card."
    ],
    accessibility: [
      "Decorative separators do not become landmarks or tab stops; keep meaningful section labels as text."
    ],
    limitations: [
      "A labeled separator adds visible grouping text; it is not a heading or disclosure trigger."
    ],
    examples: [
      {
        id: "default",
        title: "Plain, labeled and vertical content boundaries",
        module: "./examples/separator/default.tsx",
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
            exampleId: "default",
            label: "horizontal"
          },
          {
            value: "vertical",
            exampleId: "default",
            label: "vertical"
          }
        ]
      },
      {
        axis: "appearance",
        expected: ["soft", "standard", "label start", "label center"],
        shown: [
          {
            value: "standard",
            exampleId: "default",
            label: "horizontal"
          },
          {
            value: "label center",
            exampleId: "default",
            label: "Or connect manually"
          }
        ],
        omitted: [
          {
            value: "soft",
            reason: "Soft only lightens the rule's color."
          },
          {
            value: "label start",
            reason: "Start alignment moves the label to the leading edge of the same labeled rule."
          }
        ]
      },
      {
        axis: "semantics",
        expected: ["semantic", "decorative"],
        shown: [],
        omitted: [
          {
            value: "semantic",
            reason:
              "Semantic and decorative rules look identical; the difference is the exposed role, covered in the accessibility notes."
          },
          {
            value: "decorative",
            reason:
              "Semantic and decorative rules look identical; the difference is the exposed role, covered in the accessibility notes."
          }
        ]
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use a separator only where content groups change, choose decorative semantics when it conveys no structure and use a real heading for a named section."
      ],
      avoid: [
        "Put a line after every label, use a labeled separator as a disclosure or insert dot characters between unrelated facts."
      ],
      decision:
        "Choose Separator to mark an actual boundary between adjacent groups. Use spacing for a mild visual pause and a heading when the groups need names.",
      rules: [
        {
          id: "separator-usage",
          when: "Two action groups have different scopes.",
          do: "Use one separator at the boundary and retain labels that explain each group.",
          avoid: "Rely on a line alone to explain what changes between the groups.",
          reason: "A separator communicates separation but does not name the relationship.",
          evidence: [
            "src/components/v4/ui/separator.tsx",
            "src/pages/design-system/examples/separator/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Remove the divider. Adjacent group labels still explain the task boundaries; reintroducing the line clarifies an actual boundary rather than decorating every row."
          }
        }
      ],
      states: [
        {
          state: "decorative",
          guidance: "Keep a purely visual divider decorative."
        },
        {
          state: "semantic",
          guidance: "Use the intended orientation when the separation itself is meaningful."
        }
      ],
      antiSlop: [
        {
          do: "Place dividers at real boundaries.",
          avoid: "Draw borders between every sentence and every control.",
          reason: "Repeated rules flatten hierarchy and make dense interfaces harder to scan."
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
          "npm run ui:dev; open /design-system#separator and verify the documented interaction."
      }
    ]
  },
  {
    id: "skeleton",
    title: "Skeleton",
    group: "Feedback",
    summary: "Reserve content space while a resource is loading.",
    sourceFiles: ["src/components/v4/ui/skeleton.tsx"],
    exports: ["Skeleton"],
    referenceNames: ["Skeleton"],
    behavior: [
      "Skeleton reserves measured lines or a shape while the owner loads data. It does not start or finish a request."
    ],
    accessibility: [
      "Keep decorative loading structure out of the accessibility tree and provide a meaningful loading status where needed."
    ],
    limitations: [
      "Skeleton is visual and aria-hidden; the owner announces loading and replaces the shape with the actual result or error."
    ],
    examples: [
      {
        id: "default",
        title: "Pending text and a resource row",
        module: "./examples/skeleton/default.tsx",
        states: ["default"]
      },
      {
        id: "behavior",
        title: "Line counts",
        module: "./examples/skeleton/behavior.tsx",
        states: ["loading"]
      }
    ],
    coverage: [
      {
        axis: "shape",
        expected: ["block", "lines"],
        shown: [
          {
            value: "block",
            exampleId: "default",
            label: "Avatar and text"
          },
          {
            value: "lines",
            exampleId: "default",
            label: "Text lines"
          }
        ]
      },
      {
        axis: "line count",
        expected: ["1", "3", "5"],
        shown: [
          {
            value: "1",
            exampleId: "behavior",
            label: "One line"
          },
          {
            value: "3",
            exampleId: "behavior",
            label: "Three lines"
          },
          {
            value: "5",
            exampleId: "behavior",
            label: "Longer block"
          }
        ]
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Match a few expected content shapes, keep them aria-hidden and let the host announce loading and replace them with the actual result or error."
      ],
      avoid: [
        "Leave skeletons after failure, animate fake content indefinitely or draw a detailed fake dashboard as decoration."
      ],
      decision:
        "Choose Skeleton when content geometry is known but its data is pending. Use EmptyState for a finished empty result and Alert for failure.",
      rules: [
        {
          id: "skeleton-usage",
          when: "A list is loading before its first rows arrive.",
          do: "Match the expected row height and approximate content areas; replace skeletons when the request settles.",
          avoid:
            "Keep animated placeholders after failure or draw unrelated generic cards in a table region.",
          reason: "The placeholder should reduce layout movement and explain pending content.",
          evidence: [
            "src/components/v4/ui/skeleton.tsx",
            "src/pages/design-system/examples/skeleton/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Compare the pending shapes with the final content at the same width. Replacing them does not shift unrelated controls, and failure ends the placeholder state."
          }
        }
      ],
      states: [
        {
          state: "initial-loading",
          guidance: "Reserve only the region that will receive the result."
        },
        {
          state: "refresh",
          guidance: "Keep useful existing rows visible when a background request is pending."
        }
      ],
      antiSlop: [
        {
          do: "Match the real content's rhythm with few shapes.",
          avoid: "Build elaborate fake dashboards from many pulsing bars.",
          reason: "Excess animation draws attention to invented content and adds no useful status."
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
          "npm run ui:dev; open /design-system#skeleton and verify the documented interaction."
      }
    ]
  },
  {
    id: "toast",
    title: "Sonner",
    group: "Feedback",
    summary: "Announce a short-lived result through themed toast notifications.",
    sourceFiles: [
      "src/components/v4/ui/sonner.tsx",
      "src/components/v4/ui/toast-stack.tsx",
      "src/components/v4/ui/helpers.module.css"
    ],
    exports: ["Toaster", "toast", "V4_TOASTER_ID", "ToastStack", "ToastItem"],
    referenceNames: ["Toast", "ToastStack"],
    behavior: [
      "Toaster renders Sonner notifications with an explicit theme or V4Scope's resolved theme. ToastStack is a separate controlled items/onDismiss composition; pending and error items persist.",
      "The v4 Toaster has its own toaster id (V4_TOASTER_ID), and the toast exported beside it routes every call to that id. The app's v3 Toaster only shows toasts without an id, so a v4 toast and a v3 toast never render twice, even when both Toasters are mounted on one page.",
      "Toaster renders sonner unstyled and draws each toast with the v4 tokens: toast-bg, toast-line and shadow-pop on the card, the row-title type for the title and small type in toast-muted for the description, both in Archivo. The status icon sits at the top, centered on the title's first line, however many lines the description wraps to. The stack is always expanded with an 8px gap, newest at the bottom, so every toast shows its content."
    ],
    accessibility: [
      "ToastStack exposes status feedback and named action/dismiss buttons. Its auto-dismiss timer pauses while hovered or keyboard-focused, then resumes the remaining duration."
    ],
    limitations: [
      "Toaster/Sonner and controlled ToastStack are alternative owners, not a shared queue. The host creates results after actual settlement and handles action effects.",
      "Call toast from @infisical/sonner, not from the sonner package: a plain sonner toast has no toaster id and goes to the app's v3 Toaster instead."
    ],
    examples: [
      {
        id: "default",
        title: "One notice per tone",
        module: "./examples/toast/default.tsx",
        states: ["default", "controlled"]
      },
      {
        id: "parts",
        title: "Trigger success and error notifications",
        module: "./examples/toast/parts.tsx",
        states: ["default"]
      }
    ],
    coverage: [
      {
        axis: "tone",
        slot: "toast",
        expected: ["neutral", "ok", "bad", "loading"],
        shown: [
          {
            value: "neutral",
            exampleId: "default",
            label: "neutral"
          },
          {
            value: "ok",
            exampleId: "default",
            label: "ok"
          },
          {
            value: "bad",
            exampleId: "default",
            label: "bad"
          },
          {
            value: "loading",
            exampleId: "default",
            label: "loading"
          }
        ]
      },
      {
        axis: "clipboard lifecycle",
        expected: ["pending", "failed", "copied", "retry"],
        shown: [],
        omitted: ["pending", "failed", "copied", "retry"].map((value) => ({
          value,
          reason:
            "The clipboard lifecycle is a host flow; the toast tones above are what it renders."
        }))
      },
      {
        axis: "size support",
        expected: ["no authored named size"],
        shown: [],
        omitted: [
          {
            value: "no authored named size",
            reason:
              "This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Use a single notification queue for useful transient results, with durable recovery where a failure needs action."
      ],
      avoid: [],
      decision:
        "Choose Toast for a recent operation result that should not move focus. Use Alert for a persistent actionable failure and inline FieldError for invalid input.",
      rules: [
        {
          id: "toast-usage",
          when: "An asynchronous save finishes after the initiating menu closes.",
          do: "Await the operation, then announce its actual result; retain a durable recovery route for a failure.",
          avoid:
            "Announce Saved on click or make a short-lived toast the only way to retry a failed mutation.",
          reason:
            "Transient feedback cannot substitute for persistence or a recoverable error state.",
          evidence: [
            "src/components/v4/ui/sonner.tsx",
            "src/pages/design-system/examples/toast/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Reject an operation and a clipboard write. No success toast appears before fulfillment, and a failure that needs repair remains recoverable after transient feedback disappears."
          }
        },
        {
          id: "toast-one-feedback-owner",
          when: "A recent operation needs transient result feedback.",
          do: "Choose Toaster or controlled ToastStack as the queue owner, create success after settlement and keep actionable errors reachable.",
          avoid:
            "Send the same result to both queues, dismiss a pending operation by timer or use a toast as the only field validation message.",
          reason:
            "Duplicate or transient feedback can obscure which operation failed and where to recover.",
          detect: {
            by: "review",
            how: "Keep a clipboard promise pending, reject it and retry. One queue reports each outcome, and a failed or loading item does not disappear before the person can act."
          },
          evidence: [
            "src/components/v4/ui/sonner.tsx",
            "src/pages/design-system/examples/toast/default.tsx"
          ]
        }
      ],
      states: [
        {
          state: "pending",
          guidance:
            "Keep the operation pending until it resolves rather than immediately issuing success."
        },
        {
          state: "error",
          guidance: "Use an action only if the host can actually retry or undo the operation."
        }
      ],
      antiSlop: [
        {
          do: "Name the completed object or action in one short sentence.",
          avoid: "Send the same success message through a toast, banner and inline alert at once.",
          reason: "Repeated announcements interrupt the ongoing task."
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
        command: "npm run ui:dev; open /design-system#toast and verify the documented interaction."
      }
    ]
  },
  {
    id: "spinner",
    title: "Spinner",
    group: "Feedback",
    summary: "Show the Infisical pixel mark while real work remains pending.",
    sourceFiles: ["src/components/v4/ui/spinner.tsx", "src/components/v4/ui/runtime.module.css"],
    exports: ["Spinner", "SpinnerSize"],
    referenceNames: ["Spinner"],
    behavior: [
      "Inline, base and page sizes. Without label the mark stands alone and is decorative. With label it shows that text beside or under the mark inside one polite status.",
      'size="page" centres the mark and label in the available region and may add a short description under the label. delay holds the whole indicator back for that many milliseconds, so a fast request never flashes it, and cancels when unmounted.',
      "The ref reaches the svg mark. className and other props reach the outer element: the svg without a label, the status wrapper with one."
    ],
    accessibility: [
      "With label, one polite status contains the label and the mark is hidden from assistive technology; without one the mark is decorative. With reduced motion the mark stops animating."
    ],
    limitations: [
      "Spinner communicates activity only. The owner controls when loading starts and ends; description is shown only at page size and only with a label. Do not use animation duration to estimate request completion."
    ],
    examples: [
      {
        id: "default",
        title: "Spinner",
        module: "./examples/spinner/default.tsx",
        states: ["loading"]
      }
    ],
    coverage: [
      {
        axis: "size",
        expected: ["inline", "base", "page"],
        shown: [
          { value: "inline", exampleId: "default", label: "inline" },
          { value: "base", exampleId: "default", label: "base" },
          { value: "page", exampleId: "default", label: "page" }
        ]
      },
      {
        axis: "delay",
        expected: ["immediate", "delayed"],
        shown: [],
        omitted: [
          {
            value: "immediate",
            reason: "The default: every specimen here starts at once."
          },
          {
            value: "delayed",
            reason:
              "A delayed spinner renders nothing until the delay passes, so a static specimen would be empty. brand-runtime.test.tsx exercises it with fake timers."
          }
        ]
      }
    ],
    guidance: {
      use: [
        "Mount Spinner only while work is outstanding. Use inline inside a control or line that already supplies context, a labelled base spinner for a pending region, and page size for a whole empty page. Set delay to avoid brief flashes and replace it with the result or recovery on settlement."
      ],
      avoid: [
        "Name both a decorative spinner and its busy parent with repeated announcements, leave a delayed spinner scheduled after unmount, or use a timer to imply the request completed."
      ],
      decision:
        "Choose Spinner for any pending activity: bare inside an action, labelled for a region, page size for a page. Use Progress for measurable completion.",
      rules: [
        {
          id: "spinner-usage",
          when: "A saving button already announces its pending label.",
          do: "Keep the embedded spinner decorative so the same operation is not announced twice.",
          avoid: "Expose a second live loading message on the icon beside Saving changes.",
          reason: "Duplicate status announcements repeat one operation without new information.",
          evidence: [
            "src/components/v4/ui/spinner.tsx",
            "src/pages/design-system/examples/spinner/default.tsx"
          ],
          detect: {
            by: "review",
            how: "Inspect a pending action's accessibility output and reduced-motion rendering. One meaningful pending announcement remains without a duplicate announcement from its decorative mark."
          }
        },
        {
          id: "spinner-pending-region",
          when: "A request for a region takes longer than its initial optimistic delay.",
          do: "Keep the label tied to that request, set delay to avoid a flash, and unmount the spinner when the request succeeds or fails.",
          avoid:
            "Continue the animation after failure or imply a percentage the request does not report.",
          reason: "Activity indicates outstanding work, not completion or success.",
          evidence: [
            "src/components/v4/ui/spinner.tsx",
            "src/pages/design-system/examples/spinner/default.tsx"
          ],
          detect: {
            by: "test",
            test: "src/components/v4/ui/brand-runtime.test.tsx",
            how: "The delayed spinner shows nothing before its delay, then its label, and leaves no timer after unmount."
          }
        }
      ],
      states: [
        {
          state: "pending",
          guidance:
            "Show the mark only while real work is outstanding. Name the work, such as Loading environments, where the region lacks its own status."
        },
        {
          state: "reduced-motion",
          guidance: "Keep the pending meaning understandable when animation is reduced."
        }
      ],
      antiSlop: [
        {
          do: "Keep indicator size subordinate to the action it accompanies and use one indicator per pending region.",
          avoid:
            "Turn a compact spinner into a large decorative page centerpiece or mount several synchronized spinners around one operation.",
          reason: "Indicator scale should reflect the affected region rather than add visual drama."
        }
      ]
    },
    checks: [
      {
        kind: "static",
        command: "npm run type:check"
      },
      {
        kind: "runtime",
        command: "npm test -- src/components/v4/ui/brand-runtime.test.tsx"
      },
      {
        kind: "browser",
        command:
          "npm run ui:dev; open /design-system#spinner and verify the documented interaction."
      }
    ]
  }
] satisfies readonly ComponentDefinition[];
