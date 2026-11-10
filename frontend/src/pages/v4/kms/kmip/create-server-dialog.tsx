import { useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { useGo } from "../../links";
import { HOSTNAMES_HINT, hostnamesError, keyAlgorithmOptions, kmipLinks } from "./shared";

export const CreateKmipServerDialog = ({
  orgId,
  onOpenChange
}: {
  orgId: string;
  onOpenChange: (open: boolean) => void;
}) => {
  const go = useGo();
  const create = useV4Adapter("kmip").useCreateServer();
  const [name, setName] = useState("");
  const [hostnames, setHostnames] = useState("");
  const [keyAlgorithm, setKeyAlgorithm] = useState<string>(CertKeyAlgorithm.RSA_2048);
  const [errors, setErrors] = useState<{ name?: string; hostnames?: string }>({});
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const next = {
      name: name.trim() ? undefined : "Name is required",
      hostnames: hostnamesError(hostnames)
    };
    setErrors(next);
    if (next.name || next.hostnames) return;
    setPending(true);
    try {
      const server = await create.mutateAsync({
        name: name.trim(),
        hostnamesOrIps: hostnames.trim(),
        keyAlgorithm: keyAlgorithm as CertKeyAlgorithm,
        authMethod: { method: "token" }
      });
      saved(`Created KMIP server ${server.name}`);
      onOpenChange(false);
      go(kmipLinks.server(orgId, server.id));
    } catch (error) {
      failed("Failed to create KMIP server", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Create KMIP server</DialogTitle>
          <DialogDescription>
            Generate an enrollment token and deploy it from the server&apos;s page.
          </DialogDescription>
        </DialogHeader>
        <form
          id="create-kmip-server"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field label="Name" error={errors.name}>
              <Input
                autoFocus
                placeholder="my-kmip-server"
                value={name}
                invalid={Boolean(errors.name)}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Hostnames or IPs" description={HOSTNAMES_HINT} error={errors.hostnames}>
              <Input
                placeholder="kmip.example.com, 10.0.0.5"
                value={hostnames}
                invalid={Boolean(errors.hostnames)}
                onChange={(event) => setHostnames(event.target.value)}
              />
            </Field>
            <Field label="Key algorithm" description="Signs the server certificate.">
              <Select
                label="Key algorithm"
                value={keyAlgorithm}
                options={keyAlgorithmOptions}
                onChange={setKeyAlgorithm}
              />
            </Field>
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-kmip-server" loading={pending}>
            Create KMIP server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
