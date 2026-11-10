import { useState } from "react";

import { Card } from "@app/components/v4/ui/card";
import { Code } from "@app/components/v4/ui/code";
import { Switch } from "@app/components/v4/ui/switch";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [audit, setAudit] = useState(true);
  const [rotation, setRotation] = useState(false);
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="One row">
        <Card variant="framed" title="SCIM provisioning">
          <Switch
            layout="row"
            label="Enable SCIM"
            description="Provision and deprovision members from your identity provider."
            disabledReason="You need permission to edit SCIM."
          />
        </Card>
      </ExampleCell>
      <ExampleCell align="stretch" label="Stacked rows">
        <Card variant="framed" title="Security">
          <Switch
            layout="row"
            label="Audit events"
            description="Stream every read and write to the audit log."
            checked={audit}
            onChange={setAudit}
          />
          <Switch
            layout="row"
            label="Automatic rotation"
            description={
              <>
                Rotate <Code>DB_PASSWORD</Code> every 30 days.
              </>
            }
            checked={rotation}
            onChange={setRotation}
          />
        </Card>
      </ExampleCell>
    </ExampleGrid>
  );
}
