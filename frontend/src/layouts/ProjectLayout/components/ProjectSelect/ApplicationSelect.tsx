import { useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Check } from "lucide-react";

import {
  Badge,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandItemLink,
  CommandList,
  ResourceIcon
} from "@app/components/v3";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications";
import { useDebounce } from "@app/hooks/useDebounce";
import {
  NavbarBlock,
  NavbarSwitcher,
  NavbarSwitcherContent,
  NavbarSwitcherTrigger
} from "@app/layouts/NavbarSwitcher";

const ApplicationSelectInner = ({
  applicationName,
  orgId
}: {
  applicationName: string;
  orgId: string;
}) => {
  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const navigate = useNavigate();
  const { data } = useListPkiApplications({ search: debouncedSearch || undefined, limit: 20 });
  const applications = data?.applications ?? [];

  const displayName = applicationName;

  // cmdk activates a row through onSelect, which fires both on pointer click and on
  // Enter for the arrow-key selected row, so all plain activation is funnelled here.
  const handleSelect = (nextName: string) => {
    setOpen(false);
    if (nextName === applicationName) return;
    navigate({
      to: `/organizations/${orgId}/cert-manager/applications/${nextName}` as never
    } as never);
  };

  return (
    <NavbarBlock className="min-w-16">
      <NavbarSwitcher
        open={open}
        onOpenChange={(nextOpen) => {
          // Clearing on open lets cmdk pick the first row again, as it did while its
          // selection was uncontrolled. Reset here rather than on close so the paths that
          // call setOpen(false) directly cannot leave a stale row selected.
          if (nextOpen) setSelectedValue("");
          setOpen(nextOpen);
        }}
      >
        <Link
          to={`/organizations/${orgId}/cert-manager/applications/${applicationName}` as never}
          className="group flex cursor-pointer items-center gap-x-2 overflow-hidden text-sm text-foreground-inverse"
        >
          <ResourceIcon className="size-[14px] shrink-0 text-project" />
          <span className="truncate">{displayName}</span>
          <Badge variant="project" className="hidden lg:inline-flex">
            Application
          </Badge>
        </Link>
        <NavbarSwitcherTrigger aria-label="switch-application" />
        <NavbarSwitcherContent className="w-96">
          <Command shouldFilter={false} value={selectedValue} onValueChange={setSelectedValue}>
            <CommandInput
              aria-label="Search applications"
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
                    className="relative gap-2"
                  >
                    <Check className={app.name === applicationName ? "opacity-100" : "opacity-0"} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      {/* The name is the row's link, so its accessible name comes from visible
                          text and its stretched pseudo-element covers the row. Being a tab stop
                          means focus must drive cmdk's selection: cmdk resolves Enter against the
                          row it has marked aria-selected, never against the focused element, so
                          without this onFocus a tabbed-to row would activate whichever row the
                          arrow keys last selected and switch the user to the wrong application. */}
                      <CommandItemLink
                        to={
                          `/organizations/${orgId}/cert-manager/applications/${app.name}` as never
                        }
                        onFocus={() => setSelectedValue(app.name)}
                      >
                        {app.name}
                      </CommandItemLink>
                      <span className="truncate text-[11px] text-muted">
                        {app.description || "No description"}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </NavbarSwitcherContent>
      </NavbarSwitcher>
    </NavbarBlock>
  );
};

export const ApplicationSelect = () => {
  const params = useParams({ strict: false }) as {
    applicationName?: string;
    orgId?: string;
  };
  const search = useSearch({ strict: false }) as { fromApplication?: string };
  const { orgId } = params;
  const applicationName = params.applicationName ?? search.fromApplication;
  if (!applicationName || !orgId) return null;

  return <ApplicationSelectInner applicationName={applicationName} orgId={orgId} />;
};
