import * as React from "react";
import { BellIcon, CodeXmlIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline } from "@app/components/v4/ui/layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableRowActionsSeparator,
  TableRowIndicators
} from "@app/components/v4/ui/table";

const rows = [
  { id: "database-url", name: "DATABASE_URL", annotated: true },
  { id: "log-level", name: "LOG_LEVEL", annotated: false }
];

export default function RowActions() {
  const [status, setStatus] = React.useState("");
  return (
    <>
      <Table aria-label="Example secrets with row actions">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Name</TableHead>
            <TableHead scope="col">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.name}</TableCell>
              <TableCell>
                <Inline gap={8} wrap={false}>
                  <code>••••••••••••</code>
                  {row.annotated && (
                    <TableRowIndicators swap>
                      <span>
                        <Icon icon={BellIcon} label="Has reminder" />
                      </span>
                      <span>
                        <Icon icon={CodeXmlIcon} label="Has metadata" />
                      </span>
                    </TableRowIndicators>
                  )}
                  <TableRowActions reveal>
                    {row.annotated && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-row"
                          icon="bell"
                          iconOnly
                          onClick={() => setStatus(`Opened the reminder for ${row.name}.`)}
                        >
                          {`View reminder for ${row.name}`}
                        </Button>
                        <TableRowActionsSeparator />
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-row"
                      icon="copy"
                      iconOnly
                      onClick={() => setStatus(`Copied the fabricated value of ${row.name}.`)}
                    >
                      {`Copy ${row.name}`}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-row" icon="more" iconOnly>
                          {`More actions for ${row.name}`}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setStatus(`Opened ${row.name}.`)}>
                          Open secret
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableRowActions>
                </Inline>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell>JWT_SIGNING_KEY override</TableCell>
            <TableCell>
              <Inline gap={8} wrap={false}>
                <code>••••••••••••</code>
                <TableRowActions>
                  <Button
                    variant="ghost"
                    size="icon-row"
                    icon="copy"
                    iconOnly
                    onClick={() => setStatus("Copied the fabricated override.")}
                  >
                    Copy override
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-row"
                    icon="trash"
                    iconOnly
                    onClick={() => setStatus("Removed the fabricated override.")}
                  >
                    Remove override
                  </Button>
                </TableRowActions>
              </Inline>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p role="status" className="sr-only">
        {status}
      </p>
    </>
  );
}
