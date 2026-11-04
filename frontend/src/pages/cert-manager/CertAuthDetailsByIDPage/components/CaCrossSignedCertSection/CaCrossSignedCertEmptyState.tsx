import { FileSignatureIcon, UploadIcon } from "lucide-react";

import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

import { GENERATE_CSR_DENIED_TEXT, TCrossSignedCertPopUp } from "./crossSignedCertUtils";

type Props = {
  canGenerateCsr: boolean;
  canManageCrossSignedCert: boolean;
  onOpen: (popUp: TCrossSignedCertPopUp) => void;
};

export const CaCrossSignedCertEmptyState = ({
  canGenerateCsr,
  canManageCrossSignedCert,
  onOpen
}: Props) => {
  const actions = [
    {
      popUp: "generateCrossSignCsr",
      variant: "outline",
      Icon: FileSignatureIcon,
      label: "Generate CSR",
      isAllowed: canGenerateCsr,
      deniedText: GENERATE_CSR_DENIED_TEXT
    },
    {
      popUp: "importCrossSignedCert",
      variant: "project",
      Icon: UploadIcon,
      label: "Import Certificate",
      isAllowed: canManageCrossSignedCert,
      deniedText: "You don't have permission to import certificates for this CA"
    }
  ] as const;

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyDescription>
          Have your old CA sign a copy of this CA&apos;s certificate so clients that only trust the
          old CA accept its certificates.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex items-center gap-2">
          {actions.map((action) => (
            <Tooltip key={action.popUp}>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant={action.variant}
                    size="sm"
                    isDisabled={!action.isAllowed}
                    onClick={() => onOpen(action.popUp)}
                  >
                    <action.Icon />
                    {action.label}
                  </Button>
                </span>
              </TooltipTrigger>
              {!action.isAllowed && <TooltipContent>{action.deniedText}</TooltipContent>}
            </Tooltip>
          ))}
        </div>
      </EmptyContent>
    </Empty>
  );
};
