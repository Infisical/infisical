import { PlugZap } from "lucide-react";

import { Button } from "@app/components/v3";

import { WebAccessStatusCard } from "./WebAccessStatusCard";

type Props = {
  onReconnect: () => void;
  title?: string;
  description?: string;
};

export const DisconnectedScreen = ({
  onReconnect,
  title = "Session disconnected",
  description = "This session has ended. Reconnect to start a new one."
}: Props) => (
  <WebAccessStatusCard overlay icon={PlugZap} title={title} description={description}>
    <Button variant="pam" isFullWidth onClick={onReconnect}>
      Reconnect
    </Button>
  </WebAccessStatusCard>
);
