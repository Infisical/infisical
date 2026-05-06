import { Copy, Info } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TEmailDomain, useVerifyEmailDomain } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["verifyDomain"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["verifyDomain"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["verifyDomain"]>, state?: boolean) => void;
};

export const EmailDomainVerificationModal = ({
  popUp,
  handlePopUpClose,
  handlePopUpToggle
}: Props) => {
  const domainData = popUp?.verifyDomain?.data as TEmailDomain | undefined;

  const { mutateAsync: verifyDomain, isPending } = useVerifyEmailDomain();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    createNotification({ text: "Copied to clipboard", type: "info" });
  };

  const handleVerify = async () => {
    if (!domainData) return;
    try {
      await verifyDomain({ emailDomainId: domainData.id });
      createNotification({
        text: "Domain verified successfully!",
        type: "success"
      });
      handlePopUpClose("verifyDomain");
    } catch (error) {
      createNotification({
        text:
          (error as Error)?.message ||
          "Failed to verify domain. Please check your DNS records and try again.",
        type: "error"
      });
    }
  };

  const txtValue = `infisical-domain-verification=${domainData?.verificationCode ?? ""}`;

  return (
    <Dialog
      open={popUp?.verifyDomain?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("verifyDomain", isOpen)}
    >
      <DialogContent className="max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Verify Email Domain</DialogTitle>
          <DialogDescription>
            Add the following DNS TXT record to verify ownership of {domainData?.domain ?? ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <DetailGroup className="rounded-md border border-border bg-card p-4">
            <Detail>
              <DetailLabel>Record Type</DetailLabel>
              <DetailValue>TXT</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel className="flex items-center justify-between">
                Record Name
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      aria-label="copy record name"
                      variant="ghost-muted"
                      size="xs"
                      onClick={() => handleCopy(domainData?.verificationRecordName ?? "")}
                    >
                      <Copy />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>Copy</TooltipContent>
                </Tooltip>
              </DetailLabel>
              <DetailValue>{domainData?.verificationRecordName}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel className="flex items-center justify-between">
                Record Value
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      aria-label="copy record value"
                      variant="ghost-muted"
                      size="xs"
                      onClick={() => handleCopy(txtValue)}
                    >
                      <Copy />
                    </IconButton>
                  </TooltipTrigger>
                  <TooltipContent>Copy</TooltipContent>
                </Tooltip>
              </DetailLabel>
              <DetailValue>{txtValue}</DetailValue>
            </Detail>
          </DetailGroup>
          <Alert variant="warning">
            <Info />
            <AlertTitle>DNS changes can take up to 48 hours to propagate</AlertTitle>
            <AlertDescription>
              Most updates propagate within minutes. The verification code expires 7 days after
              creation.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handlePopUpClose("verifyDomain")}>
            Close
          </Button>
          <Button variant="org" isPending={isPending} onClick={handleVerify}>
            Verify Domain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
