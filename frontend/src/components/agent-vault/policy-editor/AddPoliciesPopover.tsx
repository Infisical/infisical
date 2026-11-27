import { useState } from "react";
import { CheckIcon, PlusIcon } from "lucide-react";

import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import { isResourceRowKey, PERMISSION_ROWS, TPermissionRowKey } from "./agentVaultPolicyModel";

const GROUPS = [
  { heading: "Resources", rows: PERMISSION_ROWS.filter((row) => isResourceRowKey(row.key)) },
  { heading: "Capabilities", rows: PERMISSION_ROWS.filter((row) => !isResourceRowKey(row.key)) }
];

type Props = {
  isRowShown: (rowKey: TPermissionRowKey) => boolean;
  // Picking a row that shows takes it off again, as the role editor in other products does.
  onToggleRow: (rowKey: TPermissionRowKey) => void;
};

/** Picks which parts of a role the visual editor shows, so a role starts out with nothing listed. */
export const AddPoliciesPopover = ({ isRowShown, onToggleRow }: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon />
          Add Policies
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0" onWheel={(event) => event.stopPropagation()}>
        <Command>
          <CommandInput aria-label="Search policies" placeholder="Search policies..." />
          <CommandList className="overscroll-contain">
            <CommandEmpty>No policies found.</CommandEmpty>
            {GROUPS.map(({ heading, rows }) => (
              <CommandGroup key={heading} heading={heading}>
                {rows.map((row) => (
                  <CommandItem
                    key={row.key}
                    value={row.key}
                    keywords={[row.label]}
                    onSelect={() => onToggleRow(row.key)}
                  >
                    <span className="truncate">{row.label}</span>
                    <CheckIcon
                      className={cn(
                        "ml-auto text-foreground",
                        isRowShown(row.key) ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
