import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useCreateKmipServer } from "@app/hooks/api/kmipServers";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const KmipServerDeployModal = ({ isOpen, onOpenChange }: Props) => {
  const [name, setName] = useState("");
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const navigate = useNavigate();
  const { mutateAsync: createKmipServer, isPending: isCreating } = useCreateKmipServer();

  const handleCreate = async () => {
    const errors: string[] = [];
    if (!name.trim()) errors.push("Name is required");
    if (errors.length) {
      setFormErrors(errors);
      return;
    }
    setFormErrors([]);

    try {
      const kmipServer = await createKmipServer({
        name: name.trim(),
        authMethod: { method: "token" }
      });

      onOpenChange(false);
      navigate({
        to: "/organizations/$orgId/projects/kms/kmip-servers/$kmipServerId",
        params: { orgId, kmipServerId: kmipServer.id }
      });
    } catch (err: any) {
      createNotification({
        type: "error",
        text: err?.message || "Failed to create KMIP server"
      });
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setName("");
      setFormErrors([]);
    }
    onOpenChange(open);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleClose}>
      <ModalContent
        className="max-w-lg"
        title="Create KMIP Server"
        subTitle="Create a new KMIP server. You can generate an enrollment token and deploy it from the KMIP server detail page."
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
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-kmip-server"
            />
          </FormControl>
          <div className="mt-2 flex items-center gap-2">
            <Button onClick={handleCreate} isLoading={isCreating} isDisabled={isCreating} size="sm">
              Create KMIP Server
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
