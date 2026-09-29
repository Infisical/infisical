import { PlusIcon } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v3";

export type TCertificateFilterOption<TKind extends string> = {
  kind: TKind;
  label: string;
  hint: string;
};

type Props<TKind extends string> = {
  options: TCertificateFilterOption<TKind>[];
  onAdd: (kind: TKind) => void;
};

export const AddCertificateFilterMenu = <TKind extends string>({
  options,
  onAdd
}: Props<TKind>) => {
  if (options.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <PlusIcon className="size-3.5" />
          Add Filter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {options.map((option) => (
          <DropdownMenuItem key={option.kind} onClick={() => onAdd(option.kind)}>
            <div className="flex flex-col">
              <span>{option.label}</span>
              <span className="text-xs text-muted">{option.hint}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
