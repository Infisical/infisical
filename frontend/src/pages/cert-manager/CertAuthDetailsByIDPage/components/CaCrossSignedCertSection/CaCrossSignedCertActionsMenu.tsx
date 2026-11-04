import { DownloadIcon, EllipsisIcon, FileSignatureIcon, TrashIcon, UploadIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { downloadTxtFile } from "@app/helpers/download";
import { TCaCrossSignedCertificate } from "@app/hooks/api/ca/types";

import {
  GENERATE_CSR_DENIED_TEXT,
  INACTIVE_CA_TEXT,
  TCrossSignedCertPopUp
} from "./crossSignedCertUtils";

type Props = {
  caName: string;
  crossSignedCert: TCaCrossSignedCertificate;
  isCaActive: boolean;
  canGenerateCsr: boolean;
  canManageCrossSignedCert: boolean;
  onOpen: (popUp: TCrossSignedCertPopUp) => void;
};

export const CaCrossSignedCertActionsMenu = ({
  caName,
  crossSignedCert,
  isCaActive,
  canGenerateCsr,
  canManageCrossSignedCert,
  onOpen
}: Props) => {
  const getDisabledReason = (isAllowed: boolean, deniedText: string, needsActiveCa: boolean) => {
    if (needsActiveCa && !isCaActive) return INACTIVE_CA_TEXT;
    if (!isAllowed) return deniedText;
    return null;
  };

  const actions = [
    {
      popUp: "generateCrossSignCsr",
      Icon: FileSignatureIcon,
      label: "Generate CSR",
      disabledReason: getDisabledReason(canGenerateCsr, GENERATE_CSR_DENIED_TEXT, true)
    },
    {
      popUp: "importCrossSignedCert",
      Icon: UploadIcon,
      label: "Replace",
      disabledReason: getDisabledReason(
        canManageCrossSignedCert,
        "You don't have permission to replace the cross-signed certificate for this CA",
        true
      )
    },
    {
      popUp: "removeCrossSignedCert",
      Icon: TrashIcon,
      label: "Remove",
      variant: "danger",
      disabledReason: getDisabledReason(
        canManageCrossSignedCert,
        "You don't have permission to remove the cross-signed certificate for this CA",
        false
      )
    }
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="ghost" size="xs" aria-label="Cross-signed certificate options">
          <EllipsisIcon />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => downloadTxtFile(`${caName}-cross-signed.pem`, crossSignedCert.certificate)}
        >
          <DownloadIcon />
          Download
        </DropdownMenuItem>
        {actions.map((action) => (
          <Tooltip key={action.popUp} open={action.disabledReason ? undefined : false}>
            <TooltipTrigger asChild>
              <DropdownMenuItem
                variant={"variant" in action ? action.variant : undefined}
                isDisabled={Boolean(action.disabledReason)}
                isDisabledFocusable={Boolean(action.disabledReason)}
                onClick={() => onOpen(action.popUp)}
              >
                <action.Icon />
                {action.label}
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="left">{action.disabledReason}</TooltipContent>
          </Tooltip>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
