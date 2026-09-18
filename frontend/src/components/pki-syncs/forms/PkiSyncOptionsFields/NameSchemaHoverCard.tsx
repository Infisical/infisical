import { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@app/components/v3";
import { usePkiSyncOption } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "../schemas/pki-sync-schema";

type Props = {
  children: ReactNode;
};

export const NameSchemaHoverCard = ({ children }: Props) => {
  const { watch } = useFormContext<TPkiSyncForm>();
  const { syncOption } = usePkiSyncOption(watch("destination"));

  return (
    <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <Info className="cursor-help" />
      </HoverCardTrigger>
      <HoverCardContent
        side="left"
        align="start"
        collisionPadding={16}
        className="max-h-(--radix-hover-card-content-available-height) thin-scrollbar w-[28rem] overflow-y-auto"
      >
        <div className="flex flex-col gap-3">
          {children}
          {syncOption?.forbiddenCharacters && syncOption.forbiddenCharacters.length > 0 && (
            <div className="flex flex-col">
              <span className="text-warning">Character restrictions for {syncOption.name}:</span>
              <div className="text-xs text-muted">
                The following characters are not allowed:{" "}
                {syncOption.forbiddenCharacters.split("").join(" ")}
              </div>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
