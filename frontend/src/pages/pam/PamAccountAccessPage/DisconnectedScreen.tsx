import { PlugZap } from "lucide-react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";

type Props = {
  onReconnect: () => void;
  title?: string;
  description?: string;
};

export const DisconnectedScreen = ({
  onReconnect,
  title = "Session disconnected",
  description = "This session has ended. Reconnect to start a new one."
}: Props) => {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex items-center gap-3">
          <PlugZap className="size-6 shrink-0 text-product-pam" />
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="pam" isFullWidth onClick={onReconnect}>
            Reconnect
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
