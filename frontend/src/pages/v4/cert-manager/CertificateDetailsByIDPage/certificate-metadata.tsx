import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { DataList } from "@infisical/cipher/ui/list";
import { MultiStep } from "@infisical/cipher/ui/multi-step";

import type { TCertificate } from "@app/hooks/api/certificates/types";

import { type MetadataEntry, MetadataEditor } from "../../access/org/metadata-editor";
import { readableFailure, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { certificateName } from "../components/certificate";

const EditMetadataDialog = ({ cert, onClose }: { cert: TCertificate; onClose: () => void }) => {
  const update = useV4Adapter("certificates").useUpdateCertificateMetadata();
  const [initial] = useState<MetadataEntry[]>(() =>
    (cert.metadata ?? []).map(({ key, value }) => ({ key, value }))
  );
  const [entries, setEntries] = useState(initial);
  const [errors, setErrors] = useState<{ key?: string }[]>();
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: JSON.stringify(entries) !== JSON.stringify(initial),
    onDiscard: onClose
  });

  const validate = () => {
    const next = entries.map((entry) => ({ key: entry.key.trim() ? undefined : "Required" }));
    setErrors(next);
    return !next.some((entry) => entry.key);
  };

  const submit = async () => {
    await update
      .mutateAsync({
        certificateId: cert.id,
        metadata: entries.map((entry) => ({ key: entry.key.trim(), value: entry.value.trim() }))
      })
      .catch(readableFailure("Couldn't save metadata"));
    saved("Metadata saved");
    onClose();
  };

  return (
    <>
      <MultiStep
        variant="dialog"
        title={`Edit metadata for ${certificateName(cert)}`}
        open
        onOpenChange={(next) => {
          if (next || update.isPending) return;
          requestDiscard();
        }}
        completeLabel="Save"
        onComplete={submit}
        steps={[
          {
            title: "Metadata",
            validate,
            content: (
              <MetadataEditor
                boxed
                addLabel="Add entry"
                entries={entries}
                errors={errors}
                onChange={(next) => {
                  setEntries(next);
                  setErrors(undefined);
                }}
              />
            )
          }
        ]}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your metadata changes will be lost."
      />
    </>
  );
};

export const CertificateMetadataCard = ({
  cert,
  editReason
}: {
  cert: TCertificate;
  editReason?: string;
}) => {
  const [editing, setEditing] = useState(false);
  const metadata = cert.metadata ?? [];
  return (
    <Card
      variant="framed"
      title="Metadata"
      action={
        <Button
          variant="ghost"
          size="xs"
          icon="pencil"
          disabledReason={editReason}
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
      }
    >
      {metadata.length ? (
        <DataList
          variant="props"
          density="compact"
          items={metadata.map(({ key, value }) => [key, value || "None"] as const)}
        />
      ) : (
        <EmptyState size="sm" media="bare" icon="file-text" title="No metadata" />
      )}
      {editing && <EditMetadataDialog cert={cert} onClose={() => setEditing(false)} />}
    </Card>
  );
};
