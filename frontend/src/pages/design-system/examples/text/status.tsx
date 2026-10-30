import { StatusText } from "@app/components/v4/ui/text";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Status() {
  return (
    <ExampleGrid>
      <ExampleCell label="ok">
        <StatusText tone="ok" icon="check-c">
          Signed in
        </StatusText>
      </ExampleCell>
      <ExampleCell label="neutral">
        <StatusText icon="info">Never signed in</StatusText>
      </ExampleCell>
      <ExampleCell label="warn">
        <StatusText tone="warn" icon="alert">
          No auth method
        </StatusText>
      </ExampleCell>
      <ExampleCell label="bad">
        <StatusText tone="bad" icon="lock">
          Universal Auth locked out
        </StatusText>
      </ExampleCell>
    </ExampleGrid>
  );
}
