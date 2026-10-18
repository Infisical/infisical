import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { List, ListRow } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const [loading, setLoading] = useState(false);
  return (
    <ExampleGrid width="wide">
      <ExampleCell label="base" align="stretch">
        <Loader size="base" label="Loading secrets" delay={0} />
      </ExampleCell>
      <ExampleCell label="page" align="stretch">
        <Loader
          size="page"
          label="Connecting to Vercel"
          description="Large projects can take up to a minute."
          delay={0}
        />
      </ExampleCell>
      <ExampleCell label="Loaded content replaces the loader" align="stretch">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            window.setTimeout(() => setLoading(false), 2000);
          }}
        >
          Reload connections
        </Button>
        <Loader loading={loading} label="Loading connections" delay={0}>
          <List label="Connections">
            <ListRow value="vercel" label="Vercel" title="Vercel" meta="Synced" />
            <ListRow value="github" label="GitHub" title="GitHub" meta="Synced" />
          </List>
        </Loader>
      </ExampleCell>
    </ExampleGrid>
  );
}
