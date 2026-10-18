import * as React from "react";
import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { MultiStep } from "@app/components/v4/ui/multi-step";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const useConnection = () => {
  const [team, setTeam] = useState("");
  const [teamError, setTeamError] = useState(false);
  const [preview, setPreview] = useState(true);
  return [
    {
      title: "Team",
      heading: "Pick the Vercel team",
      description: "Infisical syncs secrets into this team's projects.",
      summary: team || undefined,
      validate: () => {
        setTeamError(!team.trim());
        return Boolean(team.trim());
      },
      content: (
        <Field label="Team slug" error={teamError ? "Enter the team slug." : undefined}>
          <Input
            value={team}
            aria-invalid={teamError || undefined}
            onChange={(event) => setTeam(event.target.value)}
            placeholder="acme"
          />
        </Field>
      )
    },
    {
      title: "Environments",
      heading: "Choose environments",
      description: "Production always syncs.",
      content: (
        <Field label="Also sync preview deployments" orientation="horizontal">
          <Checkbox checked={preview} onCheckedChange={(value) => setPreview(value === true)} />
        </Field>
      )
    },
    {
      title: "Review",
      heading: "Review the connection",
      description: `Connects ${team || "your team"} and syncs ${preview ? "2" : "1"} environments.`,
      content: <p>Nothing is saved until you connect.</p>
    }
  ];
};

const Connect = ({
  variant,
  trigger,
  onDone
}: {
  variant: "dialog" | "sheet" | "page";
  trigger?: React.ReactElement;
  onDone: () => void;
}) => (
  <MultiStep
    variant={variant}
    title="Connect Vercel"
    steps={useConnection()}
    completeLabel="Connect"
    onComplete={onDone}
    trigger={trigger}
  />
);

export default function Example() {
  const [done, setDone] = useState("");
  return (
    <ExampleGrid width="full">
      <ExampleCell label="dialog">
        <Connect
          variant="dialog"
          onDone={() => setDone("Vercel connected from the dialog.")}
          trigger={<Button variant="outline">Connect Vercel</Button>}
        />
      </ExampleCell>
      <ExampleCell label="sheet">
        <Connect
          variant="sheet"
          onDone={() => setDone("Vercel connected from the sheet.")}
          trigger={<Button variant="outline">Open in a sheet</Button>}
        />
      </ExampleCell>
      <ExampleCell label="page" align="stretch">
        <Connect variant="page" onDone={() => setDone("Vercel connected from the page.")} />
        {done && <p role="status">{done}</p>}
      </ExampleCell>
    </ExampleGrid>
  );
}
