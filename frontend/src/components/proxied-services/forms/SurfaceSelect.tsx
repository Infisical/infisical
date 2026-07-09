import { ChevronDownIcon, XIcon } from "lucide-react";

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@app/components/v3";
import { ProxiedServiceSubstitutionSurface } from "@app/hooks/api/proxiedServices/enums";

const SURFACE_LABELS: Record<ProxiedServiceSubstitutionSurface, string> = {
  [ProxiedServiceSubstitutionSurface.Path]: "Path",
  [ProxiedServiceSubstitutionSurface.Query]: "Query",
  [ProxiedServiceSubstitutionSurface.Body]: "Body",
  [ProxiedServiceSubstitutionSurface.Header]: "Header"
};

const ALL_SURFACES = Object.values(ProxiedServiceSubstitutionSurface);

type Props = {
  value: ProxiedServiceSubstitutionSurface[];
  onChange: (value: ProxiedServiceSubstitutionSurface[]) => void;
  isDisabled?: boolean;
};

// Multi-select for substitution surfaces: selected values show as removable chips in the trigger,
// the dropdown lists all surfaces as checkbox items.
export const SurfaceSelect = ({ value, onChange, isDisabled }: Props) => {
  const toggle = (surface: ProxiedServiceSubstitutionSurface) => {
    onChange(value.includes(surface) ? value.filter((s) => s !== surface) : [...value, surface]);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={isDisabled}>
        <Button variant="outline" className="w-full justify-between font-normal">
          <div className="flex flex-wrap items-center gap-1">
            {value.length ? (
              value.map((surface) => (
                <Badge key={surface} variant="neutral" className="gap-1">
                  {SURFACE_LABELS[surface]}
                  <XIcon
                    className="size-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isDisabled) toggle(surface);
                    }}
                  />
                </Badge>
              ))
            ) : (
              <span className="text-muted">Select surfaces</span>
            )}
          </div>
          <ChevronDownIcon className="size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
        {ALL_SURFACES.map((surface) => (
          <DropdownMenuCheckboxItem
            key={surface}
            checked={value.includes(surface)}
            onCheckedChange={() => toggle(surface)}
            onSelect={(e) => e.preventDefault()}
          >
            {SURFACE_LABELS[surface]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
