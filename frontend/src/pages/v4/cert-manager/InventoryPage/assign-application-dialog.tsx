import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Combobox } from "@infisical/cipher/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";

import type { TCertificate } from "@app/hooks/api/certificates/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { certificateName } from "../components/certificate";

const AssignForm = ({ cert, onClose }: { cert: TCertificate; onClose: () => void }) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [applicationId, setApplicationId] = useState("");
  const { data, isPending } = useV4Adapter("pkiApplications").useApplications({
    search: debouncedSearch.trim() || undefined,
    limit: 20
  });
  const assign = useV4Adapter("certificates").useAssignToApplication();
  const options = (data?.applications ?? []).map((application) => ({
    value: application.id,
    label: application.name
  }));
  const name = certificateName(cert);

  const submit = async () => {
    try {
      const assigned = await assign.mutateAsync({ certificateId: cert.id, applicationId });
      saved(
        `${name} assigned to ${assigned.applicationName ?? options.find((option) => option.value === applicationId)?.label ?? "the application"}`
      );
      onClose();
    } catch (error) {
      failed("Couldn't assign the certificate", error);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent pending={assign.isPending}>
        <DialogHeader>
          <DialogTitle>{`Assign ${name} to an application`}</DialogTitle>
          <DialogDescription>
            Once assigned, the certificate can&apos;t move to another application.
          </DialogDescription>
        </DialogHeader>
        <Field label="Application">
          <Combobox
            label="Application"
            placeholder="Select an application"
            emptyText={isPending ? "Loading" : "No applications found"}
            options={options}
            value={applicationId}
            onValueChange={setApplicationId}
            onSearch={setSearch}
            loading={isPending}
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabledReason={applicationId ? undefined : "Select an application"}
            loading={assign.isPending}
            onClick={submit}
          >
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const AssignApplicationDialog = ({
  cert,
  onClose
}: {
  cert?: TCertificate;
  onClose: () => void;
}) => (cert ? <AssignForm cert={cert} onClose={onClose} /> : null);
