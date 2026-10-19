import { type KeyboardEvent, useRef, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { CommandMenu } from "@app/components/v4/ui/command-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v4/ui/tooltip";

import { ExampleCell, ExampleGrid } from "../../example-presentation";

export default function Example() {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const shortcut = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.nativeEvent.isComposing ||
      event.key.toLowerCase() !== "k" ||
      !(event.metaKey || event.ctrlKey) ||
      (event.metaKey && event.ctrlKey) ||
      event.altKey ||
      event.shiftKey
    )
      return;
    if (
      event.target instanceof HTMLElement &&
      event.target.closest(
        'input, textarea, select, [role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])'
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    setSearch(true);
  };
  return (
    <section onKeyDownCapture={shortcut} aria-label="Tooltip actions">
      <TooltipProvider>
        <ExampleGrid width="compact">
          <ExampleCell label="Shortcut hint">
            <Tooltip content="Open search" shortcut="mod+K">
              <Button ref={trigger} variant="outline" onClick={() => setSearch(true)}>
                Search components
              </Button>
            </Tooltip>
          </ExampleCell>
          <ExampleCell label="Controlled content">
            <Tooltip open={open} onOpenChange={setOpen}>
              <TooltipTrigger asChild>
                <Button variant="outline" asChild>
                  <a href="#field">Retention settings</a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Versions remain available for 30 days.</TooltipContent>
            </Tooltip>
          </ExampleCell>
        </ExampleGrid>
        <CommandMenu
          hotkey={false}
          open={search}
          onOpenChange={setSearch}
          label="Find a component"
          groups={[
            {
              label: "Components",
              items: [
                { id: "input", label: "Input", href: "#input" },
                { id: "table", label: "Table", href: "#table" }
              ]
            }
          ]}
        />
      </TooltipProvider>
    </section>
  );
}
