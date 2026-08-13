import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useCreateRelay } from "@app/hooks/api/relays";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const RelayDeployModal = ({ isOpen, onOpenChange }: Props) => {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const navigate = useNavigate();
  const { mutateAsync: createRelay, isPending: isCreating } = useCreateRelay();
  const areRequiredFieldsProvided = Boolean(name.trim() && host.trim());

  const handleCreate = async () => {
    const errors: string[] = [];
    if (!name.trim()) errors.push("Name is required");
    if (!host.trim()) errors.push("Host is required");
    if (errors.length) {
      setFormErrors(errors);
      return;
    }
    setFormErrors([]);

    try {
      const relay = await createRelay({
        name: name.trim(),
        host: host.trim(),
        authMethod: { method: "token" }
      });

      onOpenChange(false);
      navigate({
        to: "/organizations/$orgId/networking/relays/$relayId",
        params: { orgId, relayId: relay.id }
      });
    } catch {
      // The shared mutation error handler displays the API error.
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setName("");
      setHost("");
      setFormErrors([]);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Relay</DialogTitle>
          <DialogDescription>
            Generate an enrollment token for a relay on its detail page.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field data-invalid={formErrors.includes("Name is required")}>
            <FieldLabel htmlFor="relay-name">Name</FieldLabel>
            <Input
              id="relay-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-relay"
              isError={formErrors.includes("Name is required")}
              autoFocus
            />
            <FieldError>
              {formErrors.includes("Name is required") ? "Name is required" : undefined}
            </FieldError>
          </Field>
          <Field data-invalid={formErrors.includes("Host is required")}>
            <FieldLabel htmlFor="relay-host">Host</FieldLabel>
            <Input
              id="relay-host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="10.0.0.5 or relay.example.com"
              isError={formErrors.includes("Host is required")}
            />
            <FieldError>
              {formErrors.includes("Host is required") ? "Host is required" : undefined}
            </FieldError>
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="org"
              onClick={handleCreate}
              isPending={isCreating}
              isDisabled={isCreating || !areRequiredFieldsProvided}
            >
              Create Relay
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
