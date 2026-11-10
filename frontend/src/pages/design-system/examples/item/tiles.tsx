import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@app/components/v4/ui/card";
import { Media, Tile } from "@app/components/v4/ui/item";
import { Grid } from "@app/components/v4/ui/layout";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [selected, setSelected] = useState(false);
  return (
    <ExampleGrid width="full">
      <ExampleCell label="On a surface: bordered" align="stretch">
        <Tile selected={selected} onClick={() => setSelected(!selected)}>
          <span className="flex items-center gap-3">
            <Media icon="machine" />
            Machine identity
          </span>
        </Tile>
        <p role="status" className="sr-only">
          {selected ? "Machine identity selected" : "No identity selected"}
        </p>
      </ExampleCell>
      <ExampleCell label="Inside a Card: shaded" align="stretch">
        <Card variant="framed">
          <CardHeader>
            <CardTitle>Billing</CardTitle>
          </CardHeader>
          <CardContent>
            <Grid columns={3} gap={8}>
              <Tile title="Card on file" description="VISA ending in 4242" />
              <Tile title="Invoices" description="$10,800, Mar 14, 2026" />
              <Tile title="Billing details" description="Acme Corp" />
            </Grid>
          </CardContent>
        </Card>
      </ExampleCell>
    </ExampleGrid>
  );
}
