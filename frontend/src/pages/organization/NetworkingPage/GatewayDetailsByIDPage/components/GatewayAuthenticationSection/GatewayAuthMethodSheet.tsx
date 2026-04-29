import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { GatewayAuthMethodView } from "@app/hooks/api/gateways-v2/types";

import { GatewayAuthMethodSheetContent } from "./GatewayAuthMethodSheetContent";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  gatewayId: string;
  currentMethod: GatewayAuthMethodView;
};

export const GatewayAuthMethodSheet = ({
  isOpen,
  onOpenChange,
  gatewayId,
  currentMethod
}: Props) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Edit auth method</SheetTitle>
          <SheetDescription>
            Switch the gateway&apos;s auth method or update the current method&apos;s config.
          </SheetDescription>
        </SheetHeader>
        {isOpen && (
          <GatewayAuthMethodSheetContent
            gatewayId={gatewayId}
            currentMethod={currentMethod}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
