import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalClose, ModalContent } from "@app/components/v2";
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
    } catch (err: any) {
      createNotification({
        type: "error",
        text: err?.message || "Failed to create relay"
      });
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
    <Modal isOpen={isOpen} onOpenChange={handleClose}>
      <ModalContent
        className="max-w-lg"
        title="Create Relay"
        subTitle="Create a new relay. You can generate an enrollment token and deploy it from the relay detail page."
        bodyClassName="overflow-visible"
      >
        <div className="flex flex-col gap-4">
          {formErrors.length > 0 && (
            <div className="rounded-md bg-red-500/10 p-3">
              {formErrors.map((e) => (
                <p key={e} className="text-sm text-red-400">
                  {e}
                </p>
              ))}
            </div>
          )}
          <FormControl label="Name" isRequired>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-relay" />
          </FormControl>
          <FormControl label="Host" isRequired>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="10.0.0.5 or relay.example.com"
            />
          </FormControl>
          <div className="mt-2 flex items-center gap-2">
            <Button onClick={handleCreate} isLoading={isCreating} isDisabled={isCreating} size="sm">
              Create Relay
            </Button>
            <ModalClose asChild>
              <Button size="sm" colorSchema="secondary">
                Cancel
              </Button>
            </ModalClose>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};
