import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { MultiStep } from "@infisical/cipher/ui/multi-step";

import type { TCertificate } from "@app/hooks/api/certificates/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { readableFailure, saved } from "../../access/toast";
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
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: Boolean(applicationId),
    onDiscard: onClose
  });
  const options = (data?.applications ?? []).map((application) => ({
    value: application.id,
    label: application.name
  }));
  const name = certificateName(cert);

  const submit = async () => {
    const assigned = await assign
      .mutateAsync({ certificateId: cert.id, applicationId })
      .catch(readableFailure("Couldn't assign the certificate"));
    saved(
      `${name} assigned to ${assigned.applicationName ?? options.find((option) => option.value === applicationId)?.label ?? "the application"}`
    );
    onClose();
  };

  return (
    <>
      <MultiStep
        variant="dialog"
        title={`Assign ${name} to an application`}
        description="Once assigned, the certificate can't move to another application."
        open
        onOpenChange={(next) => {
          if (next || assign.isPending) return;
          requestDiscard();
        }}
        completeLabel="Assign"
        onComplete={submit}
        steps={[
          {
            title: "Application",
            disabledReason: applicationId ? undefined : "Select an application",
            content: (
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
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="The selected application will be lost."
      />
    </>
  );
};

export const AssignApplicationDialog = ({
  cert,
  onClose
}: {
  cert?: TCertificate;
  onClose: () => void;
}) => (cert ? <AssignForm cert={cert} onClose={onClose} /> : null);
