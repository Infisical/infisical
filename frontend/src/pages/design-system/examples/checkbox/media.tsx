import * as React from "react";

import { Checkbox } from "@app/components/v4/ui/checkbox";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const methods = [
  {
    id: "google",
    icon: "Google Workspace.svg",
    label: "Google",
    description: "Workspace accounts"
  },
  { id: "github", icon: "GitHub.png", label: "GitHub", description: "Organization members" },
  { id: "gitlab", icon: "GitLab.png", label: "GitLab", description: undefined }
];

export default function Example() {
  const [enabled, setEnabled] = React.useState<string[]>(["google"]);
  return (
    <ExampleGrid width="compact">
      <ExampleCell label="Login methods with logos">
        <div className="flex flex-col gap-3">
          {methods.map((method) => (
            <Checkbox
              key={method.id}
              media={<ProviderIcon icon={method.icon} alt="" />}
              label={method.label}
              description={method.description}
              checked={enabled.includes(method.id)}
              onChange={(checked) =>
                setEnabled((current) =>
                  checked ? [...current, method.id] : current.filter((id) => id !== method.id)
                )
              }
            />
          ))}
        </div>
      </ExampleCell>
      <ExampleCell label="Node label">
        <Checkbox
          label={
            <>
              Enforce <strong>SAML</strong> for every member
            </>
          }
        />
      </ExampleCell>
    </ExampleGrid>
  );
}
