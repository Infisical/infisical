import { useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  Badge,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  IconButton,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  ResourceIcon
} from "@app/components/v3";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications";
import { useDebounce } from "@app/hooks/useDebounce";

const ApplicationSelectInner = ({
  applicationName,
  projectId,
  orgId
}: {
  applicationName: string;
  projectId: string;
  orgId: string;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const navigate = useNavigate();
  const { data } = useListPkiApplications({ search: debouncedSearch || undefined, limit: 20 });
  const applications = data?.applications ?? [];

  const displayName = applicationName;

  const handleSelect = (nextName: string) => {
    setOpen(false);
    if (nextName === applicationName) return;
    navigate({
      to: `/organizations/${orgId}/projects/cert-manager/${projectId}/applications/${nextName}` as never
    } as never);
  };

  return (
    <div className="mr-2 flex min-w-16 items-center gap-1 pr-1 pl-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Link
            to={
              `/organizations/${orgId}/projects/cert-manager/${projectId}/applications/${applicationName}` as never
            }
            className="group flex cursor-pointer items-center gap-x-2 overflow-hidden text-sm text-white"
          >
            <ResourceIcon className="size-[14px] shrink-0 text-project" />
            <span className="truncate">{displayName}</span>
            <Badge variant="project" className="hidden lg:inline-flex">
              Application
            </Badge>
          </Link>
        </PopoverAnchor>
        <PopoverTrigger asChild>
          <IconButton variant="ghost" size="xs" aria-label="switch-application">
            <ChevronsUpDown />
          </IconButton>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={20} className="w-96 p-0">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search applications..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No applications found.</CommandEmpty>
              <CommandGroup heading="Applications">
                {applications.map((app) => (
                  <CommandItem
                    key={app.id}
                    value={app.name}
                    onSelect={() => handleSelect(app.name)}
                    className="gap-2"
                  >
                    <Check className={app.name === applicationName ? "opacity-100" : "opacity-0"} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{app.name}</span>
                      <span className="truncate text-[11px] text-muted">
                        {app.description || "No description"}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export const ApplicationSelect = () => {
  const params = useParams({ strict: false }) as {
    applicationName?: string;
    projectId?: string;
    orgId?: string;
  };
  const search = useSearch({ strict: false }) as { fromApplication?: string };
  const { projectId, orgId } = params;
  const applicationName = params.applicationName ?? search.fromApplication;
  if (!applicationName || !projectId || !orgId) return null;

  return (
    <ApplicationSelectInner applicationName={applicationName} projectId={projectId} orgId={orgId} />
  );
};
