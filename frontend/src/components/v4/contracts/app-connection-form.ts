import type { ComponentDefinition } from "./types";

export const appConnectionFormDefinition = {
  id: "app-connection-form",
  title: "App connection form",
  group: "Patterns",
  summary:
    "Create an app connection from a preset, on its own or inside a Combobox creation dialog.",
  sourceFiles: ["src/components/v4/patterns/app-connection-form.tsx"],
  exports: [
    "AppConnectionForm",
    "AppConnectionFieldPreset",
    "AppConnectionFormProps",
    "AppConnectionFormValues",
    "AppConnectionMethodPreset",
    "AppConnectionPreset",
    "AppConnectionRedirect",
    "AppConnectionRedirectPreset",
    "PendingConnectionRedirect",
    "connectionCreation"
  ],
  referenceNames: ["AppConnectionForm", "connectionCreation"],
  behavior: [
    "AppConnectionForm renders one form element with the given id: Name (in the sans: a connection name is a name, rule/mono-machine-values), Method as a Select when the preset has more than one, the chosen method's fields, then an optional Description. It has no buttons of its own; the host's submit Button targets the form by id.",
    "A preset carries the app, its display name, its methods and the app's create schema from the shared data layer. The form validates only through that schema (zodResolver), so its rules and messages match the v3 form for the same app. Changing the method swaps in that method's credentials and clears their errors. A field with visible shows only while visible(values) is true.",
    "Field kinds map to v4 controls: text and number to Input, secret to SecretInput, textarea to Textarea, select to Select and switch to Switch. Errors show under their field; a rejected onSubmit shows its message, or a retry sentence that names the app, in a destructive Alert under the fields and keeps every value.",
    "onDirtyChange and onPendingChange report the form's dirty and submitting state, and every control is disabled while it submits.",
    "A method with redirect (GitHub App install, OAuth) has no credential fields. It is offered only when the host passes redirect: { returnTo, projectId, option, start }, where returnTo is the calling flow's v4 href, option is the app's connection option from the server and start stores the pending record. In the app, build it with connectionRedirect from pages/v4/data/integrations/connection-redirect.ts. Submit validates through the schema, then calls start with the method's href and the app, method, name, description, credentials, projectId and returnTo; connectionRedirect's start generates a random state, stores the record in localStorage under V4_CONNECTION_REDIRECT_STORAGE_KEY (helpers/appConnections.ts) and sends the person to href with state appended. While href is undefined (the server has no app configured) a neutral Alert shows the method's unconfigured sentence and submit shows it as the failure instead of redirecting.",
    "The v4 callback route, /v4/organizations/$orgId/app-connections/$appConnection/callback, calls takeConnectionRedirect(state) from the same data module, which clears the stored record only when the state matches. It builds the credentials with the method's redirect.credentials from the callback parameters, creates the connection through the integrations adapter, shows a success toast and replaces the location with returnTo plus connectionId and connectionName. A missing, corrupt or mismatched record, a different app or a rejected create shows a failed() toast with the reason or the server message and returns to returnTo without the connection, or to Integrations when there is no record.",
    "connectionCreation({ preset, disabledReason, redirect, create }) returns the Combobox creation for a connection picker: mode dialog, the Create connection row, a Create <app> Connection Dialog, the Discard connection setup? prompt and an onSubmit that awaits create and calls complete with the new connection as the option. When every usable method redirects, the submit label is the method's submitLabel, for example Connect to GitHub. It is not a hook; the Combobox owns the dialog state. It returns undefined without a preset or without a usable method."
  ],
  accessibility: [
    "Every control has a visible label through Field, and errors are announced through the Field note."
  ],
  limitations: [
    "Presets live with the data layer, in pages/v4/data/integrations/connection-presets.ts: GitHub Radar (GitHub App install, a redirect method), AWS (Assume Role and Access Key), GitHub (Personal Access Token on cloud or Enterprise Server) and PostgreSQL (username and password). Gateways, platform-managed credentials, credential rotation and reconnecting an existing connection are not part of the shell yet.",
    "Providers return to the redirect URI registered for the app, which today is main's /organization/app-connections/<app>/oauth/callback. Main's callback forwards a return whose state matches the stored v4 record to the v4 callback route, so the registered URI does not change.",
    "The form does not call the API. The host's create function runs the mutation (the live adapter's useCreateConnection, or a local fixture in demos) and returns the created id and name."
  ],
  related: ["combobox"],
  examples: [
    {
      id: "default",
      title: "Create a connection from the picker",
      module: "./examples/app-connection-form/default.tsx",
      states: ["controlled", "loading", "disabled"]
    },
    {
      id: "redirect",
      title: "Connect through a redirect method",
      module: "./examples/app-connection-form/redirect.tsx",
      states: ["default", "error"]
    }
  ],
  guidance: {
    use: [
      "Use AppConnectionForm with a preset wherever a v4 flow creates an app connection, and connectionCreation for a connection picker."
    ],
    avoid: [
      "Copy an app's zod schema into the preset or the page, or add a second submit Button inside the form."
    ],
    decision:
      "Choose AppConnectionForm for creating a connection in place. For a redirect method, pass redirect with the calling flow's href and read connectionId and connectionName from its search params on return. Link to the Integrations page when the app has no preset yet.",
    rules: [
      {
        id: "app-connection-form-shared-schema",
        when: "A preset is added for another app.",
        do: "Export the app's create schema from lib/schemas/app-connections.ts, import it in both the v3 form and the preset, and describe only fields and defaults in the preset.",
        avoid: "Write a second schema for v4 or validate fields inside the form component.",
        reason: "Two schemas drift, and then v4 accepts a connection the API or v3 rejects.",
        evidence: [
          "src/components/v4/patterns/app-connection-form.tsx",
          "src/pages/design-system/examples/app-connection-form/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Search the preset and the form for z. calls; every schema comes from lib/schemas/app-connections.ts."
        }
      }
    ],
    states: [
      {
        state: "pending",
        guidance:
          "Controls are disabled and the host's submit Button shows loading until create settles."
      },
      {
        state: "failed",
        guidance: "The Alert says what failed, the values stay and the person can submit again."
      }
    ],
    antiSlop: [
      {
        do: "Suggest a lowercase, dashed name from the search text and show the app in the Dialog title.",
        avoid: "Title the Dialog New item or prefill a name the slug schema rejects.",
        reason: "People recognise connections by app and name in every later picker."
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
      command: "npx vitest run src/components/v4/ui/combobox.test.tsx"
    },
    {
      kind: "browser",
      command:
        "npm run dev; open /design-system/patterns/app-connection-form, create a connection and cancel a dirty form."
    }
  ]
} satisfies ComponentDefinition;
