import { Snippet } from "@app/components/v4/ui/snippet";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleCell align="stretch" label="Command">
      <Snippet label="Run with project secrets" value="infisical run -- npm start" prompt="$" />
    </ExampleCell>
  );
}
