# App connection form

Create an app connection from a preset, on its own or inside a Combobox creation dialog.

## Choose this component

Choose AppConnectionForm for creating a connection in place. For a redirect method, pass redirect with the calling flow's href and read connectionId and connectionName from its search params on return. Link to the Integrations page when the app has no preset yet.

## Usage rules

### app-connection-form-shared-schema

Owner: app-connection-form.

When a preset is added for another app.

Do: Export the app's create schema from lib/schemas/app-connections.ts, import it in both the v3 form and the preset, and describe only fields and defaults in the preset.

Avoid: Write a second schema for v4 or validate fields inside the form component.

Why: Two schemas drift, and then v4 accepts a connection the API or v3 rejects.

Checked by: review only. Look for: Search the preset and the form for z. calls; every schema comes from lib/schemas/app-connections.ts.

Source evidence:
- src/components/v4/patterns/app-connection-form.tsx
- src/pages/design-system/examples/app-connection-form/default.tsx

## State guidance

- pending: Controls are disabled and the host's submit Button shows loading until create settles.
- failed: The Alert says what failed, the values stay and the person can submit again.

## Presentation rules

Do: Suggest a lowercase, dashed name from the search text and show the app in the Dialog title.

Avoid: Title the Dialog New item or prefill a name the slug schema rejects.

Why: People recognise connections by app and name in every later picker.

## Import and exports

- src/components/v4/patterns/app-connection-form.tsx

Exports: AppConnectionForm, AppConnectionFieldPreset, AppConnectionFormProps, AppConnectionFormValues, AppConnectionMethodPreset, AppConnectionPreset, AppConnectionRedirect, AppConnectionRedirectPreset, PendingConnectionRedirect, connectionCreation. Source TypeScript defines the API.

## Behavior

- AppConnectionForm renders one form element with the given id: Name (in the sans: a connection name is a name, rule/mono-machine-values), Method as a Select when the preset has more than one, the chosen method's fields, then an optional Description. It has no buttons of its own; the host's submit Button targets the form by id.
- A preset carries the app, its display name, its methods and the app's create schema from the shared data layer. The form validates only through that schema (zodResolver), so its rules and messages match the v3 form for the same app. Changing the method swaps in that method's credentials and clears their errors. A field with visible shows only while visible(values) is true.
- Field kinds map to v4 controls: text and number to Input, secret to SecretInput, textarea to Textarea, select to Select and switch to Switch. Errors show under their field; a rejected onSubmit shows its message, or a retry sentence that names the app, in a destructive Alert under the fields and keeps every value.
- onDirtyChange and onPendingChange report the form's dirty and submitting state, and every control is disabled while it submits.
- A method with redirect (GitHub App install, OAuth) has no credential fields. It is offered only when the host passes redirect: { returnTo, projectId, option, start }, where returnTo is the calling flow's v4 href, option is the app's connection option from the server and start stores the pending record. In the app, build it with connectionRedirect from pages/v4/data/integrations/connection-redirect.ts. Submit validates through the schema, then calls start with the method's href and the app, method, name, description, credentials, projectId and returnTo; connectionRedirect's start generates a random state, stores the record in localStorage under V4_CONNECTION_REDIRECT_STORAGE_KEY (helpers/appConnections.ts) and sends the person to href with state appended. While href is undefined (the server has no app configured) a neutral Alert shows the method's unconfigured sentence and submit shows it as the failure instead of redirecting.
- The v4 callback route, /v4/organizations/$orgId/app-connections/$appConnection/callback, calls takeConnectionRedirect(state) from the same data module, which clears the stored record only when the state matches. It builds the credentials with the method's redirect.credentials from the callback parameters, creates the connection through the integrations adapter, shows a success toast and replaces the location with returnTo plus connectionId and connectionName. A missing, corrupt or mismatched record, a different app or a rejected create shows a failed() toast with the reason or the server message and returns to returnTo without the connection, or to Integrations when there is no record.
- connectionCreation({ preset, disabledReason, redirect, create }) returns the Combobox creation for a connection picker: mode dialog, the Create connection row, a Create <app> Connection Dialog, the Discard connection setup? prompt and an onSubmit that awaits create and calls complete with the new connection as the option. The submit label follows the selected method: a redirect method's submitLabel, for example Connect to GitLab, and Create connection for a credential method. AppConnectionForm reports it through onSubmitLabelChange. It is not a hook; the Combobox owns the dialog state. It returns undefined without a preset or without a usable method.

## Accessibility

- Every control has a visible label through Field, and errors are announced through the Field note.

## Use cases

- Use AppConnectionForm with a preset wherever a v4 flow creates an app connection, and connectionCreation for a connection picker.

## Avoid

- Copy an app's zod schema into the preset or the page, or add a second submit Button inside the form.

## Limits

- Presets live with the data layer, in pages/v4/data/integrations/connection-presets.ts: GitHub Radar (GitHub App install, a redirect method), AWS (Assume Role and Access Key), GitHub (Personal Access Token on cloud or Enterprise Server) and PostgreSQL (username and password). Gateways, platform-managed credentials, credential rotation and reconnecting an existing connection are not part of the shell yet.
- Providers return to the redirect URI registered for the app, which today is main's /organization/app-connections/<app>/oauth/callback. Main's callback forwards a return whose state matches the stored v4 record to the v4 callback route, so the registered URI does not change.
- The form does not call the API. The host's create function runs the mutation (the live adapter's useCreateConnection, or a local fixture in demos) and returns the created id and name.

## Executable examples

### Create a connection from the picker

Save this example at `src/pages/design-system/examples/app-connection-form/default.tsx`; its relative imports are generated for that exact path. States: controlled, loading, disabled.

Registry items used: @infisical/app-connection-form, @infisical/combobox, @infisical/field. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { connectionCreation } from "../../../../components/v4/patterns/app-connection-form";
import { Combobox, type ComboboxOption } from "../../../../components/v4/ui/combobox";
import { Field } from "../../../../components/v4/ui/field";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { CONNECTION_PRESETS } from "@app/pages/v4/data/integrations/connection-presets";

const seeded: ComboboxOption[] = [
  { value: "aws-production", label: "aws-production", meta: "Assume Role" },
  {
    value: "aws-payments-legacy-access-key",
    label: "aws-payments-legacy-access-key",
    meta: "Access Key"
  }
];

export default function Example() {
  const [options, setOptions] = useState(seeded);
  const [value, setValue] = useState("aws-production");
  const creation = connectionCreation({
    preset: CONNECTION_PRESETS[AppConnection.AWS],
    create: async (values) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 900);
      });
      const connection = { id: `demo-${values.name}`, name: values.name };
      setOptions((current) => [...current, { value: connection.id, label: connection.name }]);
      return connection;
    }
  });
  const selected = options.find((option) => option.value === value)?.label ?? "none";
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Field label="AWS connection">
            <Combobox
              label="AWS connection"
              options={options}
              value={value}
              onChange={setValue}
              placeholder="Select connection"
              creation={creation}
            />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">{`Selected: ${selected}. Demo data, nothing is sent.`}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Field label="AWS connection">
            <Combobox
              label="AWS connection"
              options={seeded}
              defaultValue="aws-production"
              creation={connectionCreation({
                preset: CONNECTION_PRESETS[AppConnection.AWS],
                disabledReason: "No permission to create.",
                create: async () => {
                  throw new Error("Creation is not allowed.");
                }
              })}
            />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Without permission to create connections"}
        </figcaption>
      </figure>
    </div>
  );
}
```

### Connect through a redirect method

Save this example at `src/pages/design-system/examples/app-connection-form/redirect.tsx`; its relative imports are generated for that exact path. States: default, error.

Registry items used: @infisical/app-connection-form, @infisical/combobox, @infisical/field. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { connectionCreation } from "../../../../components/v4/patterns/app-connection-form";
import { Combobox } from "../../../../components/v4/ui/combobox";
import { Field } from "../../../../components/v4/ui/field";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { CONNECTION_PRESETS } from "@app/pages/v4/data/integrations/connection-presets";
import { connectionRedirect } from "@app/pages/v4/data/integrations/connection-redirect";
import { orgHref } from "@app/pages/v4/links";

const create = async () => {
  throw new Error("Redirect methods are created by the callback route.");
};

export default function Example() {
  const preset = CONNECTION_PRESETS[AppConnection.GitHubRadar];
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Field label="GitHub Radar connection">
            <Combobox
              label="GitHub Radar connection"
              options={[]}
              placeholder="Select connection"
              creation={connectionCreation({
                preset,
                redirect: connectionRedirect({
                  returnTo: orgHref("demo", "/secret-scanning/data-sources"),
                  option: { appClientSlug: "infisical-radar-demo" }
                }),
                create
              })}
            />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {
            "Connect to GitHub installs the app on GitHub, then returns to the demo data sources page"
          }
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Field label="GitHub Radar connection">
            <Combobox
              label="GitHub Radar connection"
              options={[]}
              placeholder="Select connection"
              creation={connectionCreation({
                preset,
                redirect: connectionRedirect({
                  returnTo: orgHref("demo", "/secret-scanning/data-sources")
                }),
                create
              })}
            />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Server without a GitHub App configured"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npx vitest run src/components/v4/ui/combobox.test.tsx
- browser: npm run dev; open /design-system/patterns/app-connection-form, create a connection and cancel a dirty form.
