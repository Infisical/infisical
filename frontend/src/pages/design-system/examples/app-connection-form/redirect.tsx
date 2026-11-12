import { connectionCreation } from "@app/components/v4/patterns/app-connection-form";
import { Combobox } from "@app/components/v4/ui/combobox";
import { Field } from "@app/components/v4/ui/field";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { CONNECTION_PRESETS } from "@app/pages/v4/data/integrations/connection-presets";
import { connectionRedirect } from "@app/pages/v4/data/integrations/connection-redirect";
import { orgHref } from "@app/pages/v4/links";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const create = async () => {
  throw new Error("Redirect methods are created by the callback route.");
};

export default function Example() {
  const preset = CONNECTION_PRESETS[AppConnection.GitHubRadar];
  return (
    <ExampleGrid width="wide">
      <ExampleCell label="Connect to GitHub installs the app on GitHub, then returns to the demo data sources page">
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
      </ExampleCell>
      <ExampleCell label="Server without a GitHub App configured">
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
      </ExampleCell>
    </ExampleGrid>
  );
}
