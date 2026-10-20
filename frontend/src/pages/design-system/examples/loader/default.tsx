import { useState } from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Media } from "@app/components/v4/ui/item";
import { List, ListRow } from "@app/components/v4/ui/list";
import { Loader } from "@app/components/v4/ui/loader";
import { Skeleton } from "@app/components/v4/ui/skeleton";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const connections = [
  { value: "vercel", title: "Vercel", description: "Production, 14 secrets", icon: "globe" },
  { value: "github", title: "GitHub", description: "Actions, 9 secrets", icon: "git" }
] as const;

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
      <ExampleCell label="Known rows reload as skeleton rows" align="stretch">
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
        <div aria-busy={loading}>
          {loading && (
            <span role="status" className="sr-only">
              Loading connections
            </span>
          )}
          <List label="Connections">
            {connections.map((connection) =>
              loading ? (
                <ListRow
                  key={connection.value}
                  value={connection.value}
                  label={connection.title}
                  media={<Skeleton width={40} height={40} />}
                  title={
                    <span className="flex h-(--v4-type-row-title-line-height) items-center">
                      <Skeleton width={48} height={12} />
                    </span>
                  }
                  meta={<Skeleton width={68} height={20} />}
                >
                  <span className="flex h-(--v4-type-small-line-height) items-center">
                    <Skeleton width={144} height={10} />
                  </span>
                </ListRow>
              ) : (
                <ListRow
                  key={connection.value}
                  value={connection.value}
                  label={connection.title}
                  media={<Media icon={connection.icon} />}
                  title={connection.title}
                  description={connection.description}
                  meta={
                    <Badge tone="ok" dot>
                      Synced
                    </Badge>
                  }
                />
              )
            )}
          </List>
        </div>
      </ExampleCell>
    </ExampleGrid>
  );
}
