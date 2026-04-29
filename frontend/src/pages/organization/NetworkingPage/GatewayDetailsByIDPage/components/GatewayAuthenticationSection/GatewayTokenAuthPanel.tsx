import { createNotification } from "@app/components/notifications";
import { Button, SheetFooter } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useUpdateGateway } from "@app/hooks/api/gateways-v2";

type Props = {
  gatewayId: string;
  isAlreadyOnToken: boolean;
  onClose: () => void;
};

export const GatewayTokenAuthPanel = ({ gatewayId, isAlreadyOnToken, onClose }: Props) => {
  const { mutateAsync: updateGateway, isPending } = useUpdateGateway();
  const { isSubOrganization } = useOrganization();

  const handleSubmit = async () => {
    try {
      await updateGateway({ gatewayId, authMethod: { method: "token" } });
      createNotification({ type: "success", text: "Auth method updated" });
      onClose();
    } catch {
      createNotification({ type: "error", text: "Failed to update auth method" });
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 shrink flex-col overflow-y-auto p-4" />
      <SheetFooter className="shrink-0 border-t border-border">
        <Button
          isPending={isPending}
          isDisabled={isPending || isAlreadyOnToken}
          variant={isSubOrganization ? "sub-org" : "org"}
          type="button"
          onClick={handleSubmit}
        >
          Update
        </Button>
        <Button onClick={onClose} variant="outline" className="mr-auto" type="button">
          Cancel
        </Button>
      </SheetFooter>
    </div>
  );
};
