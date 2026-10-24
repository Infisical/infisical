import {
  ArrowBigUp,
  ArrowLeft,
  ArrowRight,
  ArrowRightToLine,
  ArrowUpDown,
  ChevronUp,
  Command,
  CornerDownLeft,
  Delete,
  Option
} from "lucide-react";

import { Icon } from "@app/components/v4/ui/icon";

import { ExampleGrid } from "../../example-presentation";

const fallbacks = [
  { icon: Command, name: "Command", use: "Kbd" },
  { icon: ArrowBigUp, name: "ArrowBigUp", use: "Kbd shift" },
  { icon: Option, name: "Option", use: "Kbd" },
  { icon: ChevronUp, name: "ChevronUp", use: "Kbd control" },
  { icon: CornerDownLeft, name: "CornerDownLeft", use: "Kbd enter" },
  { icon: Delete, name: "Delete", use: "Kbd backspace" },
  { icon: ArrowLeft, name: "ArrowLeft", use: "Kbd" },
  { icon: ArrowRight, name: "ArrowRight", use: "Kbd" },
  { icon: ArrowRightToLine, name: "ArrowRightToLine", use: "Kbd tab" },
  { icon: ArrowUpDown, name: "ArrowUpDown", use: "Unsorted column" }
];

export default function Example() {
  return (
    <ExampleGrid width="compact">
      {fallbacks.map(({ icon, name, use }) => (
        <span key={name} className="flex min-w-0 flex-col items-center gap-2 text-center text-sm">
          <Icon icon={icon} />
          <span>{name}</span>
          <span className="text-muted-foreground text-xs">Lucide, {use}</span>
        </span>
      ))}
    </ExampleGrid>
  );
}
