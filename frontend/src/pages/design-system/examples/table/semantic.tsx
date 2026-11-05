import * as React from "react";

import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

const environments = [
  { id: "production", name: "Production", secrets: 128 },
  { id: "staging", name: "Staging", secrets: 42 },
  { id: "development", name: "Development", secrets: 0 }
];

export default function SemanticTable() {
  const [selected, setSelected] = React.useState<string[]>(["staging"]);
  const all = selected.length === environments.length;
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  return (
    <ExampleGrid width="full">
      <ExampleCell align="stretch" label="Caption and footer">
        <Table aria-label="Environment inventory">
          <TableCaption>Fabricated environment inventory</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Environment</TableHead>
              <TableHead scope="col" className="text-right">
                Secrets
              </TableHead>
              <TableHead scope="col">Rotation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Production</TableCell>
              <TableCell className="text-right">128</TableCell>
              <TableCell>2 overdue</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Staging</TableCell>
              <TableCell className="text-right">0</TableCell>
              <TableCell>No secrets</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right">128</TableCell>
              <TableCell>2 environments</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </ExampleCell>
      <ExampleCell align="stretch" label="Selection column">
        <Table aria-label="Selectable environments">
          <TableHeader>
            <TableRow>
              <TableHead selection>
                <Checkbox
                  aria-label="Select all environments"
                  checked={all || (selected.length > 0 && "indeterminate")}
                  onCheckedChange={() => setSelected(all ? [] : environments.map((env) => env.id))}
                />
              </TableHead>
              <TableHead scope="col">Environment</TableHead>
              <TableHead scope="col" className="text-right">
                Secrets
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {environments.map((env) => (
              <TableRow
                key={env.id}
                data-state={selected.includes(env.id) ? "selected" : undefined}
              >
                <TableCell selection>
                  <Checkbox
                    aria-label={`Select ${env.name}`}
                    checked={selected.includes(env.id)}
                    onCheckedChange={() => toggle(env.id)}
                  />
                </TableCell>
                <TableCell>{env.name}</TableCell>
                <TableCell className="text-right">{env.secrets}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ExampleCell>
    </ExampleGrid>
  );
}
