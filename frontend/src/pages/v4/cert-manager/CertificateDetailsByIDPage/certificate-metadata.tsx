import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { DataList } from "@infisical/cipher/ui/list";

import type { TCertificate } from "@app/hooks/api/certificates/types";

import { type MetadataEntry, MetadataEditor } from "../../access/org/metadata-editor";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { certificateName } from "../components/certificate";

const EditMetadataDialog = ({ cert, onClose }: { cert: TCertificate; onClose: () => void }) => {
  const update = useV4Adapter("certificates").useUpdateCertificateMetadata();
  const [entries, setEntries] = useState<MetadataEntry[]>(() =>
    (cert.metadata ?? []).map(({ key, value }) => ({ key, value }))
  );
  const [errors, setErrors] = useState<{ key?: string }[]>();

  const submit = async () => {
    const next = entries.map((entry) => ({ key: entry.key.trim() ? undefined : "Required" }));
    setErrors(next);
    if (next.some((entry) => entry.key)) return;
    try {
      await update.mutateAsync({
        certificateId: cert.id,
        metadata: entries.map((entry) => ({ key: entry.key.trim(), value: entry.value.trim() }))
      });
      saved("Metadata saved");
      onClose();
    } catch (error) {
      failed("Couldn't save metadata", error);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent pending={update.isPending}>
        <DialogHeader>
          <DialogTitle>{`Edit metadata for ${certificateName(cert)}`}</DialogTitle>
        </DialogHeader>
        <form
          id="certificate-metadata"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
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
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="certificate-metadata"
            loading={update.isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
