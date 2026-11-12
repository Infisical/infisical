import { useId, useState } from "react";

import { AppConnectionForm } from "@app/components/v4/patterns/app-connection-form";
import { Button } from "@app/components/v4/ui/button";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { MySqlConnectionMethod } from "@app/hooks/api/appConnections/types/mysql-connection";
import { CONNECTION_PRESETS } from "@app/pages/v4/data/integrations/connection-presets";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const preset = CONNECTION_PRESETS[AppConnection.MySql];
  const formId = useId();
  const [pending, setPending] = useState(false);
  const [label, setLabel] = useState("Update credentials");
  if (!preset) return null;
  return (
    <ExampleGrid width="wide">
      <ExampleCell label="Only the stored method's fields show; platform-managed credentials stay a create-time choice">
        <div className="flex flex-col gap-4">
          <AppConnectionForm
            id={formId}
            preset={preset}
            edit={{
              method: MySqlConnectionMethod.UsernameAndPassword,
              values: {
                name: "orders-db",
                description: null,
                credentials: {
                  host: "orders.db.internal",
                  port: 3306,
                  database: "orders",
                  username: "infisical",
                  sslEnabled: true
                }
              }
            }}
            onPendingChange={setPending}
            onSubmitLabelChange={setLabel}
            onSubmit={() =>
              new Promise((resolve) => {
                setTimeout(resolve, 600);
              })
            }
          />
          <div>
            <Button type="submit" form={formId} loading={pending}>
              {label}
            </Button>
          </div>
        </div>
      </ExampleCell>
    </ExampleGrid>
  );
}
