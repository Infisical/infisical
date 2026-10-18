import type { ComponentDefinition } from "./types";

export const sensitiveEditorDefinition = {
  id: "sensitive-editor",
  title: "Sensitive editor",
  group: "Forms",
  summary: "Explicit reveal and replacement editing with host-owned access and persistence.",
  sourceFiles: [
    "src/components/v4/ui/sensitive-editor.tsx",
    "src/components/v4/ui/data.module.css"
  ],
  exports: ["SensitiveEditor", "SecretInput", "CopyButton", "StoredSecret"],
  referenceNames: ["SecretInput"],
  behavior: [
    "Stored identity and replacement draft are separate. Replacing never fetches the stored value. One-line sensitive hosts use 32px with 24px nested reveal/copy actions; multiline content may grow.",
    "Host reveal/save promises receive AbortSignal. Identity/revision change invalidates pending work and clears plaintext.",
    "Copy awaits the actual write before success notification. Failures preserve current draft and show recovery. CopyButton size sm/md/lg describes a 32/36/40px host and produces a 24/28/32px nested action, defaulting to sm. iconOnly defaults to false; icon-only actions retain their accessible label."
  ],
  accessibility: [
    "Every editor has a label and announced loading/result state.",
    "Escape cancels an unsaved edit and masks the value again. The editor keeps whitespace and normal keyboard editing.",
    "Neither the masked display nor its accessible name contains the stored value."
  ],
  limitations: [
    "Masking does not grant or enforce authorization. Hosts decide permission and perform fetch/decryption/save.",
    "Read-only SecretInput already receives plaintext in memory. Use SensitiveEditor to defer retrieval until explicit reveal.",
    "Plaintext cannot be erased from browser memory reliably; remasking removes rendered/session references only.",
    "Copy writes to the system clipboard. The component cannot promise expiry or clearing.",
    "Keep stored identity and revision current. Capability changes remount the editor session and cancel pending work."
  ],
  related: ["input", "data-grid"],
  examples: [
    {
      id: "lifecycle",
      title: "Reveal and replace",
      module: "./examples/sensitive-editor/lifecycle.tsx",
      states: ["default", "controlled", "editing"]
    }
  ],
  coverage: [
    {
      axis: "CopyButton.size",
      expected: ["sm", "md", "lg"],
      shown: [],
      omitted: [
        {
          value: "sm",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "sm".'
        },
        {
          value: "md",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "md".'
        },
        {
          value: "lg",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "lg".'
        }
      ]
    },
    {
      axis: "capability",
      expected: [
        "empty",
        "single-line",
        "read-only",
        "reveal-only",
        "edit-without-view",
        "neither",
        "copy-restricted",
        "host-held-plaintext"
      ],
      shown: [],
      omitted: [
        {
          value: "empty",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Empty value".'
        },
        {
          value: "single-line",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Single-line value".'
        },
        {
          value: "read-only",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Read-only value".'
        },
        {
          value: "reveal-only",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Reveal only".'
        },
        {
          value: "edit-without-view",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Replace without view permission".'
        },
        {
          value: "neither",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "No reveal or edit permission".'
        },
        {
          value: "copy-restricted",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Copy restricted".'
        },
        {
          value: "host-held-plaintext",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Host-held plaintext, read-only".'
        }
      ]
    },
    {
      axis: "behavior",
      expected: [
        "multiline",
        "stale-revision",
        "stale-identity",
        "clipboard-promise",
        "overlay-escape"
      ],
      shown: [],
      omitted: [
        {
          value: "multiline",
          reason:
            "multiline starts the replacement box at three lines and keeps line breaks in the stored value; the buttons stay where they are."
        },
        {
          value: "stale-revision",
          reason:
            "Stored revision and identity changes are security-sensitive host lifecycle cases verified by component tests; the Human preview shows reveal and replace."
        },
        {
          value: "stale-identity",
          reason:
            "Stored revision and identity changes are security-sensitive host lifecycle cases verified by component tests; the Human preview shows reveal and replace."
        },
        {
          value: "clipboard-promise",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Copy identifier".'
        },
        {
          value: "overlay-escape",
          reason:
            'Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Open value".'
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Expose only the permitted reveal, replacement and copy capabilities, with stored identity separate from any replacement draft."
    ],
    avoid: [],
    decision:
      "Choose SensitiveEditor when a stored secret should be fetched only after explicit reveal. Use SecretInput only when the host already permits plaintext in memory.",
    rules: [
      {
        id: "sensitive-editor-usage",
        when: "A person may replace a stored value without permission to reveal it.",
        do: "Keep stored identity separate from an empty replacement draft and let Save await the host callback.",
        avoid: "Fetch or prefill the stored value merely to open replacement mode.",
        reason: "Editing a replacement does not require reading the existing secret.",
        evidence: [
          "src/components/v4/ui/sensitive-editor.tsx",
          "src/pages/design-system/examples/sensitive-editor/lifecycle.tsx"
        ],
        detect: {
          by: "review",
          how: "Replace without reveal, reject a save, change stored revision and reject clipboard permission. No fetch occurs for replacement, the draft survives failure and old plaintext remasks."
        }
      },
      {
        id: "sensitive-editor-capability-and-revision",
        when: "A stored secret can be revealed, replaced or copied under changing permission.",
        do: "Keep stored id and revision current, offer only permitted callbacks and preserve replacement without retrieval; await actual clipboard and save promises.",
        avoid:
          "Pass stored plaintext just to draw a mask, reveal while starting replacement or promise clipboard expiry or reliable memory erasure.",
        reason:
          "Masking is presentation, while retrieval, persistence and permission are host responsibilities with separate lifecycles.",
        detect: {
          by: "review",
          how: "Change revision during reveal, reject replacement and retry, then copy with a rejected writer. Stale plaintext does not reappear, the draft survives failure and success follows actual settlement."
        },
        evidence: [
          "src/components/v4/ui/sensitive-editor.tsx",
          "src/pages/design-system/examples/sensitive-editor/lifecycle.tsx"
        ]
      }
    ],
    states: [
      {
        state: "revealed",
        guidance:
          "Remask on Escape and on stored identity or value changes; let the host enforce permissions."
      },
      {
        state: "save-error",
        guidance: "Keep the replacement draft and error until retry or explicit cancellation."
      }
    ],
    antiSlop: [
      {
        do: "Distinguish the stored value from a replacement draft. Show pending work and keep rejection beside the retry action.",
        avoid:
          "Render a fake masked string as the editable value, announce a save before its promise resolves or claim masking is authorization.",
        reason:
          "A mask is presentation; confusing it with actual data can overwrite or expose the wrong value."
      }
    ]
  },
  checks: [
    {
      kind: "runtime",
      command:
        "npm test -- src/components/v4/ui/data-grid-model.test.ts src/components/v4/ui/specialist.test.tsx"
    },
    {
      kind: "static",
      command: "npm run type:check"
    },
    {
      kind: "browser",
      command:
        "Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery."
    }
  ]
} satisfies ComponentDefinition;
