import { useState } from "react";

import { Card } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { usePopUp } from "@app/hooks";

import { CreateGatewayPoolModal } from "../GatewayTab/components/CreateGatewayPoolModal";
import { GatewayPoolDetailPane } from "./GatewayPoolDetailPane";
import { GatewayPoolListPane } from "./GatewayPoolListPane";

export const GatewayPoolsSection = () => {
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const { popUp, handlePopUpToggle } = usePopUp(["createPool"] as const);

  return (
    <>
      <div className="flex flex-col gap-4 dashboard:flex-row">
        <Card
          className={cn(
            "h-[calc(100vh-16rem)] overflow-hidden dashboard:w-96 dashboard:shrink-0",
            selectedPoolId && "hidden dashboard:block"
          )}
        >
          <GatewayPoolListPane selectedId={selectedPoolId} onSelect={setSelectedPoolId} />
        </Card>
        <Card className={cn("min-w-0 flex-1", !selectedPoolId && "hidden dashboard:block")}>
          <GatewayPoolDetailPane poolId={selectedPoolId} onBack={() => setSelectedPoolId(null)} />
        </Card>
      </div>

      <CreateGatewayPoolModal
        isOpen={popUp.createPool.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("createPool", isOpen)}
      />
    </>
  );
};
