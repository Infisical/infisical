import { useEffect, useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";

type Instance = {
  id: string;
  name: string;
  slug: string;
};

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  instances: Instance[];
  orgDefaultProjectId: string | null;
  onSelect: (projectId: string) => void;
};

export const CertManagerSelectInstanceModal = ({
  isOpen,
  onOpenChange,
  instances,
  orgDefaultProjectId,
  onSelect
}: Props) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) setSelectedId(orgDefaultProjectId);
  }, [isOpen, orgDefaultProjectId]);

  const handleOpenProject = () => {
    if (selectedId) onSelect(selectedId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="gap-4">
          <DialogTitle>Select a Certificate Manager project</DialogTitle>
          <DialogDescription>
            Your organization has multiple Certificate Manager projects. Select one to continue.
            Once you&apos;ve consolidated to a single project, this prompt won&apos;t appear again.{" "}
            <a
              href="https://infisical.com/docs/documentation/platform/pki/migration"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-500 hover:underline"
            >
              View the migration guide.
            </a>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Certificate Manager project</span>
          <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent position="popper" className="max-h-72 w-(--radix-select-trigger-width)">
              {instances.map((instance) => (
                <SelectItem
                  key={instance.id}
                  value={instance.id}
                  description={
                    instance.id === orgDefaultProjectId ? "Organization default" : undefined
                  }
                >
                  {instance.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="project" isDisabled={!selectedId} onClick={handleOpenProject}>
            Open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
