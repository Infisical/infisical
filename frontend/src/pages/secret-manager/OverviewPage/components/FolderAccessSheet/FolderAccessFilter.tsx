import {
  BotIcon,
  ClockIcon,
  FilterIcon,
  FolderIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

import { TFolderAccessActor } from "./folder-access.utils";

export type TFolderAccessActorType = TFolderAccessActor["type"];

export enum FolderAccessKind {
  Admin = "admin",
  ProjectRole = "project-role",
  FolderGrant = "folder-grant",
  Override = "override",
  Temporary = "temporary"
}

export type TFolderAccessFilter = {
  types: TFolderAccessActorType[];
  kinds: FolderAccessKind[];
};

export const EMPTY_FOLDER_ACCESS_FILTER: TFolderAccessFilter = { types: [], kinds: [] };

const TYPE_OPTIONS: { value: TFolderAccessActorType; label: string; icon: React.ReactNode }[] = [
  { value: "user", label: "Users", icon: <UserIcon /> },
  { value: "identity", label: "Machine Identities", icon: <BotIcon /> }
];

const KIND_OPTIONS: { value: FolderAccessKind; label: string; icon: React.ReactNode }[] = [
  { value: FolderAccessKind.Admin, label: "Admin", icon: <ShieldIcon /> },
  { value: FolderAccessKind.ProjectRole, label: "Project Role", icon: <UsersIcon /> },
  { value: FolderAccessKind.FolderGrant, label: "Folder Grant", icon: <FolderIcon /> },
  { value: FolderAccessKind.Override, label: "Overrides Project Role", icon: <ShieldIcon /> },
  { value: FolderAccessKind.Temporary, label: "Temporary", icon: <ClockIcon /> }
];

const kindsOf = (actor: TFolderAccessActor) => {
  const kinds: FolderAccessKind[] = [];
  if (actor.isProjectAdmin) kinds.push(FolderAccessKind.Admin);
  else if (actor.access) kinds.push(FolderAccessKind.FolderGrant);
  else kinds.push(FolderAccessKind.ProjectRole);
  if (actor.access && actor.roles.length > 0) kinds.push(FolderAccessKind.Override);
  if (actor.access?.isTemporary) kinds.push(FolderAccessKind.Temporary);
  return kinds;
};

// an actor matches when it fits any selected type and any selected access kind; an empty group
// does not filter
export const matchesFolderAccessFilter = (
  actor: TFolderAccessActor,
  { types, kinds }: TFolderAccessFilter
) =>
  (!types.length || types.includes(actor.type)) &&
  (!kinds.length || kindsOf(actor).some((kind) => kinds.includes(kind)));

const toggle = <T,>(values: T[], value: T) =>
  values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

type Props = {
  value: TFolderAccessFilter;
  onChange: (value: TFolderAccessFilter) => void;
};

export const FolderAccessFilter = ({ value, onChange }: Props) => {
  const isActive = Boolean(value.types.length || value.kinds.length);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label="Filter access"
              size="md"
              variant={isActive ? "project" : "outline"}
            >
              <FilterIcon />
            </IconButton>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Filter access</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Type</DropdownMenuLabel>
        {TYPE_OPTIONS.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={value.types.includes(option.value)}
            onClick={(e) => {
              e.preventDefault();
              onChange({ ...value, types: toggle(value.types, option.value) });
            }}
          >
            {option.icon}
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Access</DropdownMenuLabel>
        {KIND_OPTIONS.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={value.kinds.includes(option.value)}
            onClick={(e) => {
              e.preventDefault();
              onChange({ ...value, kinds: toggle(value.kinds, option.value) });
            }}
          >
            {option.icon}
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {isActive && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange(EMPTY_FOLDER_ACCESS_FILTER)}>
              Clear Filters
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
