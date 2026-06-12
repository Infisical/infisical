import { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@app/components/v3";
import { useAssignCertificateToApplication } from "@app/hooks/api/certificates";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications";
import { useDebounce } from "@app/hooks/useDebounce";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  certificateId: string;
};

export const AssignCertificateToApplicationModal = ({ isOpen, onClose, certificateId }: Props) => {
  const [selectedApplication, setSelectedApplication] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { data, isPending } = useListPkiApplications(
    { search: debouncedSearch || undefined, limit: 20 },
    {
      enabled: isOpen
    }
  );
  const applications = data?.applications ?? [];
  const assign = useAssignCertificateToApplication();

  useEffect(() => {
    if (!isOpen) {
      setSelectedApplication(null);
      setSearch("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!selectedApplication) return;
    try {
      await assign.mutateAsync({ certificateId, applicationId: selectedApplication.id });
      createNotification({ type: "success", text: "Certificate assigned to Application" });
      onClose();
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to assign certificate.";
      createNotification({ type: "error", text: detail });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Certificate to Application</DialogTitle>
          <DialogDescription>
            This is a one-way operation, once assigned, the certificate cannot be moved to a
            different Application.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel>Application</FieldLabel>
          <FieldContent>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen} modal>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  <span className={selectedApplication ? "" : "text-muted"}>
                    {selectedApplication ? selectedApplication.name : "Select an application"}
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search applications..."
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {isPending ? "Loading applications..." : "No applications found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {applications.map((app) => (
                        <CommandItem
                          key={app.id}
                          value={app.id}
                          onSelect={() => {
                            setSelectedApplication({ id: app.id, name: app.name });
                            setPopoverOpen(false);
                          }}
                          className="gap-2"
                        >
                          <Check
                            className={
                              selectedApplication?.id === app.id ? "opacity-100" : "opacity-0"
                            }
                          />
                          <span className="truncate">{app.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </FieldContent>
        </Field>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="project"
            isPending={assign.isPending}
            isDisabled={!selectedApplication || assign.isPending}
            onClick={handleSubmit}
          >
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
