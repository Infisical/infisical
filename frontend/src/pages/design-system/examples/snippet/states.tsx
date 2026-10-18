import { Field } from "@app/components/v4/ui/field";
import { Snippet } from "@app/components/v4/ui/snippet";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="full">
      {(["sm", "md"] as const).map((size) => (
        <ExampleCell align="stretch" key={size} label={size}>
          <Snippet
            label={`${size} command`}
            size={size}
            value="infisical run -- npm start"
            prompt="$"
          />
        </ExampleCell>
      ))}
      <ExampleCell align="stretch" label="No prompt, copy disabled">
        <Snippet label="Managed environment" value="INFISICAL_ENV=staging" copyable={false} />
      </ExampleCell>
      <Field label="Unavailable command" error="Choose a project before using this command.">
        <Snippet
          label="Unavailable command"
          value="infisical run --projectId=project_staging -- npm start"
          copyable={false}
        />
      </Field>
    </ExampleGrid>
  );
}
