import { useState } from "react";

import { Alert, Banner } from "@app/components/v4/ui/alert";

import { ExampleCell, ExampleStack } from "../../example-presentation";

export default function Example() {
  const [visible, setVisible] = useState(true);
  return (
    <ExampleStack>
      <ExampleCell align="stretch" label="neutral">
        <Alert title="Rotation is scheduled">The token rotates every 30 days.</Alert>
      </ExampleCell>
      <ExampleCell align="stretch" label="info">
        <Alert tone="info" title="Read access only">
          This connection can fetch secrets.
        </Alert>
      </ExampleCell>
      <ExampleCell align="stretch" label="ok">
        <Alert tone="ok" title="Connection verified">
          The provider accepted the supplied credentials.
        </Alert>
      </ExampleCell>
      <ExampleCell align="stretch" label="warn">
        <Alert tone="warn" title="Token expires soon">
          Replace the token before it expires in 7 days.
        </Alert>
      </ExampleCell>
      {visible && (
        <ExampleCell align="stretch" label="bad">
          <Alert tone="bad" title="Connection failed" onDismiss={() => setVisible(false)}>
            The provider rejected the token. Check its access scope and try again.
          </Alert>
        </ExampleCell>
      )}
      <Banner>Production changes require an approval.</Banner>
    </ExampleStack>
  );
}
