import { useCallback, useState } from "react";
import { PlusIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button, Card, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  OrgGatewayPermissionActions,
  OrgGatewayPoolPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useSubscription } from "@app/context/SubscriptionContext";
import { usePopUp } from "@app/hooks";

import { GatewayPoolsSection } from "../GatewayPoolsSection/GatewayPoolsSection";
import { CreateGatewayPoolModal } from "../GatewayTab/components/CreateGatewayPoolModal";
import { GatewayDeployModal } from "../GatewayTab/components/GatewayDeployModal";
import { GatewayDetailPane } from "./GatewayDetailPane";
import { GatewayListPane } from "./GatewayListPane";

type Props = {
  initialGatewayId?: string;
};

export const GatewaysSection = ({ initialGatewayId }: Props) => {
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(
    initialGatewayId ?? null
  );
  const { subscription } = useSubscription();
  const showPools = Boolean(subscription?.gatewayPool);

  const [activeTab, setActiveTab] = useState("gateways");
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "createGateway",
    "createPool"
  ] as const);

  const handleSelect = useCallback((id: string) => {
    setSelectedGatewayId(id);
  }, []);

  const createButton =
    activeTab === "pools" ? (
      <OrgPermissionCan
        I={OrgGatewayPoolPermissionActions.CreateGatewayPools}
        a={OrgPermissionSubjects.GatewayPool}
      >
        {(isAllowed) => (
          <Button
            variant="neutral"
            size="sm"
            isDisabled={!isAllowed}
            onClick={() => handlePopUpOpen("createPool")}
          >
            <PlusIcon />
            Create Pool
          </Button>
        )}
      </OrgPermissionCan>
    ) : (
      <OrgPermissionCan
        I={OrgGatewayPermissionActions.CreateGateways}
        a={OrgPermissionSubjects.Gateway}
      >
        {(isAllowed) => (
          <Button
            variant="neutral"
            size="sm"
            isDisabled={!isAllowed}
            onClick={() => handlePopUpOpen("createGateway")}
          >
            <PlusIcon />
            Create Gateway
          </Button>
        )}
      </OrgPermissionCan>
    );

  const splitView = (
    <div className="flex flex-col gap-4 dashboard:flex-row">
      <Card
        className={cn(
          "h-[calc(100vh-16rem)] overflow-hidden dashboard:w-96 dashboard:shrink-0",
          selectedGatewayId && "hidden dashboard:block"
        )}
      >
        <GatewayListPane selectedId={selectedGatewayId} onSelect={handleSelect} />
      </Card>
      <Card className={cn("min-w-0 flex-1", !selectedGatewayId && "hidden dashboard:block")}>
        <GatewayDetailPane
          gatewayId={selectedGatewayId}
          onBack={() => setSelectedGatewayId(null)}
        />
      </Card>
    </div>
  );

  return (
    <>
      {showPools ? (
        <Tabs defaultValue="gateways" onValueChange={setActiveTab}>
          <div className="mb-3 flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="gateways">All Gateways</TabsTrigger>
              <TabsTrigger value="pools">Gateway Pools</TabsTrigger>
            </TabsList>
            {createButton}
          </div>
          <TabsContent value="gateways">{splitView}</TabsContent>
          <TabsContent value="pools">
            <GatewayPoolsSection />
          </TabsContent>
        </Tabs>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-end">{createButton}</div>
          {splitView}
        </>
      )}

      <GatewayDeployModal
        isOpen={popUp.createGateway.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createGateway", isOpen)}
      />
      <CreateGatewayPoolModal
        isOpen={popUp.createPool.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("createPool", isOpen)}
      />
    </>
  );
};
