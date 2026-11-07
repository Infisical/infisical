import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { Input } from "@app/components/v4/ui/input";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="wide">
      <ExampleCell align="stretch" label="no action">
        <Card variant="framed" title="Members">
          12 members, 3 pending invites.
        </Card>
      </ExampleCell>
      <ExampleCell align="stretch" label="xs Button">
        <Card
          variant="framed"
          title="Members"
          action={
            <Button variant="outline" size="xs" icon="plus">
              Invite
            </Button>
          }
        >
          12 members, 3 pending invites.
        </Card>
      </ExampleCell>
      <ExampleCell align="stretch" label="xs search Input">
        <Card
          variant="framed"
          title="Members"
          action={
            <Input size="xs" icon="search" placeholder="Search" aria-label="Search members" />
          }
        >
          12 members, 3 pending invites.
        </Card>
      </ExampleCell>
    </ExampleGrid>
  );
}
