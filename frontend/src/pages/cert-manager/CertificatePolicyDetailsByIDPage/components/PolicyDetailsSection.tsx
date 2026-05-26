import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import { TCertificatePolicy } from "@app/hooks/api/certificatePolicies";

type Props = {
  policy: TCertificatePolicy;
};

export const PolicyDetailsSection = ({ policy }: Props) => {
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
        <CardDescription>Certificate policy details</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{policy.name}</DetailValue>
          </Detail>

          <Detail>
            <DetailLabel>Policy ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              <span className="break-all">{policy.id}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      navigator.clipboard.writeText(policy.id);
                      setCopyTextId("Copied");
                    }}
                  >
                    {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>{isCopyingId ? "Copied" : "Copy ID to clipboard"}</TooltipContent>
              </Tooltip>
            </DetailValue>
          </Detail>

          {policy.description && (
            <Detail>
              <DetailLabel>Description</DetailLabel>
              <DetailValue>{policy.description}</DetailValue>
            </Detail>
          )}

          {policy.createdAt && (
            <Detail>
              <DetailLabel>Created</DetailLabel>
              <DetailValue>
                {format(new Date(policy.createdAt), "MMM d, yyyy 'at' h:mm a")}
              </DetailValue>
            </Detail>
          )}

          {policy.updatedAt && (
            <Detail>
              <DetailLabel>Last Updated</DetailLabel>
              <DetailValue>
                {format(new Date(policy.updatedAt), "MMM d, yyyy 'at' h:mm a")}
              </DetailValue>
            </Detail>
          )}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
