import { Cover } from "@app/components/v4/ui/cover";

import { ExampleCell } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleCell label="Brand cover, scales with its container" align="stretch">
      <Cover
        title={
          <>
            Infisical
            <br />
            2.0
          </>
        }
        tagline="A quiet interface for secrets, certificates and access."
      />
    </ExampleCell>
  );
}
