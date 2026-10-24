import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@app/components/v4/ui/card";
import { Media } from "@app/components/v4/ui/item";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  return (
    <ExampleGrid width="wide">
      <ExampleCell align="stretch" label="framed">
        <Card title="Posture" action={<a href="#card">View report</a>}>
          412 secrets across 3 environments. 3 are missing in production and 5 rotations are due
          this week.
        </Card>
      </ExampleCell>
      <ExampleCell align="stretch" label="framed, no header, with footer">
        <Card footer="Expires in 7 days.">
          <div className="flex items-center gap-3">
            <Media icon="key" />
            <span>Read access to staging, scoped to the payments project.</span>
          </div>
        </Card>
      </ExampleCell>
      <ExampleCell align="stretch" label="framed footer">
        <Card footer="412 secrets in 3 environments, 5 rotations due" footerPlacement="frame">
          Read access to staging, scoped to the payments project.
        </Card>
      </ExampleCell>
      {(
        [
          ["w-60", "narrow, 240px"],
          ["w-80", "narrow, 320px"],
          ["w-96", "narrow, 384px"]
        ] as const
      ).map(([width, label]) => (
        <ExampleCell key={width} label={label}>
          <div className={`${width} max-w-full min-w-0`} data-narrow-card>
            <Card
              title="Posture"
              description="Rotation and drift for the payments project"
              action={<a href="#card">View report</a>}
              footer="Updated today"
            >
              412 secrets across 3 environments.
            </Card>
          </div>
        </ExampleCell>
      ))}
      <ExampleCell align="stretch" label="plain">
        <Card variant="plain">
          <CardHeader>
            <CardTitle>Environment defaults</CardTitle>
            <CardDescription>Inherited by new connections.</CardDescription>
          </CardHeader>
          <CardContent>The default environment is staging.</CardContent>
          <CardFooter>Updated today</CardFooter>
        </Card>
      </ExampleCell>
    </ExampleGrid>
  );
}
