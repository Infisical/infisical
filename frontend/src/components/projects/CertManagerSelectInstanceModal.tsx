import { useEffect, useState } from "react";

import {
  Badge,
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

  const handleContinue = () => {
    if (selectedId) onSelect(selectedId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="gap-4">
          <DialogTitle>Select a Certificate Manager instance</DialogTitle>
          <DialogDescription>
            Support for multiple Certificate Manager projects per organization is being deprecated.
            Migrate your certificate authorities, policies, and profiles into the
            organization&apos;s default instance, secondary projects remain accessible during the
            transition period.
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent className="max-h-[60vh]">
            {instances.map((instance) => (
              <SelectItem key={instance.id} value={instance.id}>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-medium">{instance.name}</span>
                  <span className="truncate font-mono text-xs text-accent">{instance.slug}</span>
                  {instance.id === orgDefaultProjectId && (
                    <Badge variant="org" className="shrink-0">
                      Organization default
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="project" isDisabled={!selectedId} onClick={handleContinue}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
