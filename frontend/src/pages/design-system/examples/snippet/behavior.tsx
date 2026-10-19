import { useState } from "react";

import { Snippet } from "@app/components/v4/ui/snippet";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  const [copied, setCopied] = useState("");
  return (
    <ExampleCell align="stretch" label="Exact command copy">
      <Snippet
        label="Project scoped command"
        value='infisical run --projectId=project_staging --env=staging -- npm run start -- --name="  exact  "'
        onCopy={setCopied}
      />
      <p role="status" className="sr-only">
        {copied ? "Command copied" : ""}
      </p>
    </ExampleCell>
  );
}
