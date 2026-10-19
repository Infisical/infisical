import { useState } from "react";

import { AnimatedCollapse } from "@app/components/v4/ui/animated-collapse";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from "@app/components/v4/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { Switch } from "@app/components/v4/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";

import { DocSection, PageHeading, PreviewFrame } from "./doc-parts";
import { ExampleCell, ExampleGrid } from "./example-presentation";
import { tokens } from "./foundation-data";

export const MotionPage = () => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("all");
  return (
    <div>
      <PageHeading title="Motion" />
      <PreviewFrame label="Try each one">
        <ExampleGrid width="wide">
          <ExampleCell label="Fast, 80ms: switch and check">
            <div className="flex items-center gap-4">
              <Switch defaultChecked aria-label="Sync on push" />
              <Checkbox defaultChecked aria-label="Notify reviewers" />
            </div>
          </ExampleCell>
          <ExampleCell label="Moderate, 160ms: sliding selection">
            <ToggleGroup
              type="single"
              size="sm"
              value={view}
              onValueChange={(next) => next && setView(next)}
              aria-label="Filter"
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="active">Active</ToggleGroupItem>
              <ToggleGroupItem value="failing">Failing</ToggleGroupItem>
            </ToggleGroup>
          </ExampleCell>
          <ExampleCell label="Press: 1px dent">
            <Button type="button">Hold me</Button>
          </ExampleCell>
          <ExampleCell label="Menu: opens fast, closes faster">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  Open menu
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Rename</DropdownMenuItem>
                <DropdownMenuItem>Duplicate</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ExampleCell>
          <ExampleCell label="Slow, 240ms: dialog">
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="outline">
                  Open dialog
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Rotate secret</DialogTitle>
                <DialogDescription>Watch it close faster than it opened.</DialogDescription>
              </DialogContent>
            </Dialog>
          </ExampleCell>
          <ExampleCell label="Collapse: height then fade" align="stretch">
            <div className="flex flex-col items-start gap-3">
              <Button
                type="button"
                variant="outline"
                aria-expanded={open}
                aria-controls="motion-details"
                onClick={() => setOpen(!open)}
              >
                Connection details
              </Button>
              <AnimatedCollapse open={open} id="motion-details">
                <p>12 versions are synchronized.</p>
              </AnimatedCollapse>
            </div>
          </ExampleCell>
        </ExampleGrid>
      </PreviewFrame>
      <DocSection title="Tokens">
        <dl className="divide-y divide-border border-y border-border">
          {tokens.motion.tokens.map((token) => (
            <div key={token.name} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="font-mono text-xs">{token.name}</dt>
              <dd className="text-muted-foreground truncate font-mono text-xs">{token.value}</dd>
            </div>
          ))}
        </dl>
      </DocSection>
    </div>
  );
};
