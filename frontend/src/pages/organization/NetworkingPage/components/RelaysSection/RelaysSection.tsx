import { useCallback, useState } from "react";
import { PlusIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Card } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";

import { RelayDeployModal } from "../RelayTab/components/RelayDeployModal";
import { RelayDetailPane } from "./RelayDetailPane";
import { RelayListPane } from "./RelayListPane";

type Props = {
  initialRelayId?: string;
};

export const RelaysSection = ({ initialRelayId }: Props) => {
  const [selectedRelayId, setSelectedRelayId] = useState<string | null>(initialRelayId ?? null);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["createRelay"] as const);

  const handleSelect = useCallback((id: string) => {
    setSelectedRelayId(id);
  }, []);

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <OrgPermissionCan
          I={OrgRelayPermissionActions.CreateRelays}
          a={OrgPermissionSubjects.Relay}
        >
          {(isAllowed) => (
            <Button
              variant="neutral"
              size="sm"
              isDisabled={!isAllowed}
              onClick={() => handlePopUpOpen("createRelay")}
            >
              <PlusIcon />
              Create Relay
            </Button>
          )}
        </OrgPermissionCan>
      </div>

      <div className="flex flex-col gap-4 dashboard:flex-row">
        <Card
          className={cn(
            "h-[calc(100vh-16rem)] overflow-hidden dashboard:w-96 dashboard:shrink-0",
            selectedRelayId && "hidden dashboard:block"
          )}
        >
          <RelayListPane selectedId={selectedRelayId} onSelect={handleSelect} />
        </Card>
        <Card className={cn("min-w-0 flex-1", !selectedRelayId && "hidden dashboard:block")}>
          <RelayDetailPane relayId={selectedRelayId} onBack={() => setSelectedRelayId(null)} />
        </Card>
      </div>

      <RelayDeployModal
        isOpen={popUp.createRelay.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createRelay", isOpen)}
        onCreated={(relayId) => setSelectedRelayId(relayId)}
      />
    </>
  );
};
