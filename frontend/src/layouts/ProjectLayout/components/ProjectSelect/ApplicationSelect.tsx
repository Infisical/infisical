import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
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
  const navigate = useNavigate();
  const { data: applications = [] } = useListPkiApplications();

  const current = applications.find((a) => a.name === applicationName);
  const displayName = current?.name ?? applicationName;

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
          <Command>
            <CommandInput placeholder="Search applications..." />
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
  const { applicationName, projectId, orgId } = params;
  if (!applicationName || !projectId || !orgId) return null;

  return (
    <ApplicationSelectInner applicationName={applicationName} projectId={projectId} orgId={orgId} />
  );
};
