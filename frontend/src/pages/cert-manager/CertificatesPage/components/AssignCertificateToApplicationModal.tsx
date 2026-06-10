import { useEffect, useRef, useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useAssignCertificateToApplication } from "@app/hooks/api/certificates";
import { useListPkiApplicationsInfinite } from "@app/hooks/api/pkiApplications";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  certificateId: string;
};

export const AssignCertificateToApplicationModal = ({ isOpen, onClose, certificateId }: Props) => {
  const [selectedApplicationId, setSelectedApplicationId] = useState<string>("");
  const loaderRef = useRef<HTMLDivElement>(null);
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending
  } = useListPkiApplicationsInfinite(
    { limit: 25 },
    {
      enabled: isOpen
    }
  );
  const applications = data?.pages?.flatMap((page) => page?.applications ?? []) ?? [];
  const assign = useAssignCertificateToApplication();

  useEffect(() => {
    if (!isOpen) setSelectedApplicationId("");
  }, [isOpen]);

  useEffect(() => {
    if (!loaderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleSubmit = async () => {
    if (!selectedApplicationId) return;
    try {
      await assign.mutateAsync({ certificateId, applicationId: selectedApplicationId });
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
            <Select
              value={selectedApplicationId}
              onValueChange={setSelectedApplicationId}
              disabled={isPending || applications.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={
                    applications.length === 0
                      ? "No applications available"
                      : "Select an application"
                  }
                />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-60">
                {applications.map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
                {(hasNextPage || isFetchingNextPage) && (
                  <div ref={loaderRef} className="flex justify-center p-2 text-xs text-muted">
                    {isFetchingNextPage ? "Loading more..." : ""}
                  </div>
                )}
              </SelectContent>
            </Select>
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
            isDisabled={!selectedApplicationId || assign.isPending}
            onClick={handleSubmit}
          >
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
