import { format } from "date-fns";
import { ChevronDownIcon, ChevronUpIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  ButtonGroup,
  CopyButton,
  Detail,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  ProviderIcon,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import {
  SecretScanningFindingStatus,
  TSecretScanningFinding
} from "@app/hooks/api/secretScanningV2";

import { FindingStatusBadge } from "./FindingStatusBadge";

type Props = {
  finding?: TSecretScanningFinding;
  position: { index: number; total: number } | null;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onChangeStatus: (status: SecretScanningFindingStatus) => void;
  isReopening: boolean;
};

const formatDate = (date: string | Date) => format(new Date(date), "MMM d, yyyy h:mm a");

export const FindingDetailSheet = ({
  finding,
  position,
  onClose,
  onPrevious,
  onNext,
  onChangeStatus,
  isReopening
}: Props) => {
  const handleCopyFindingId = (id: string) => {
    navigator.clipboard.writeText(id);
    createNotification({ type: "info", text: "Finding ID copied to clipboard" });
  };

  return (
    <Sheet open={Boolean(finding)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent onOpenAutoFocus={(event) => event.preventDefault()}>
        {finding && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-1 pr-8">
                <span className="mr-auto flex items-center gap-2 text-xs text-muted">
                  <ProviderIcon
                    alt={`${SECRET_SCANNING_DATA_SOURCE_MAP[finding.dataSourceType].name} data source`}
                    icon={SECRET_SCANNING_DATA_SOURCE_MAP[finding.dataSourceType].image}
                    className="size-4"
                  />
                  {finding.dataSourceName}
                </span>
                {position && (
                  <span className="mr-1 text-xs text-muted">
                    {position.index + 1} of {position.total}
                  </span>
                )}
                <IconButton
                  variant="ghost"
                  size="xs"
                  aria-label="Previous finding"
                  isDisabled={!position || position.index === 0}
                  onClick={onPrevious}
                >
                  <ChevronUpIcon />
                </IconButton>
                <IconButton
                  variant="ghost"
                  size="xs"
                  aria-label="Next finding"
                  isDisabled={!position || position.index >= position.total - 1}
                  onClick={onNext}
                >
                  <ChevronDownIcon />
                </IconButton>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="font-mono">{finding.rule}</SheetTitle>
                <FindingStatusBadge status={finding.status} />
              </div>
              <SheetDescription>{finding.details.description}</SheetDescription>
            </SheetHeader>

            <div className="grid flex-1 grid-cols-2 content-start gap-4 overflow-y-auto p-4">
              <Detail className="col-span-2">
                <DetailLabel>File</DetailLabel>
                <DetailValue className="font-mono">
                  {finding.details.link ? (
                    <a
                      href={finding.details.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 hover:underline hover:underline-offset-2"
                    >
                      {finding.details.file}:{finding.details.startLine}
                      <ExternalLinkIcon className="size-3.5 shrink-0" />
                    </a>
                  ) : (
                    `${finding.details.file}:${finding.details.startLine}`
                  )}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Resource</DetailLabel>
                <DetailValue className="font-mono">{finding.resourceName}</DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Detected</DetailLabel>
                <DetailValue>{formatDate(finding.createdAt)}</DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Commit</DetailLabel>
                <DetailValue className="font-mono">
                  {finding.details.commit.slice(0, 7)}
                </DetailValue>
                {finding.details.message && (
                  <DetailValue className="line-clamp-3 text-xs text-muted">
                    {finding.details.message}
                  </DetailValue>
                )}
              </Detail>
              <Detail>
                <DetailLabel>Author</DetailLabel>
                <DetailValue>{finding.details.author}</DetailValue>
                {finding.details.email && (
                  <DetailValue className="text-xs text-muted">{finding.details.email}</DetailValue>
                )}
              </Detail>
              <Detail>
                <DetailLabel>Committed</DetailLabel>
                <DetailValue>{formatDate(finding.details.date)}</DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Severity</DetailLabel>
                <DetailValue className="capitalize">{finding.severity}</DetailValue>
              </Detail>
              <Detail className="col-span-2">
                <DetailLabel>Fingerprint</DetailLabel>
                <DetailValue className="flex items-center gap-1 font-mono text-xs">
                  <span className="min-w-0 break-all">{finding.fingerprint}</span>
                  <CopyButton value={finding.fingerprint} ariaLabel="Copy fingerprint" />
                </DetailValue>
              </Detail>
              {finding.triageComment && (
                <Detail className="col-span-2">
                  <DetailLabel>Comment</DetailLabel>
                  <DetailValue className="whitespace-pre-wrap">{finding.triageComment}</DetailValue>
                </Detail>
              )}
            </div>

            <SheetFooter className="justify-between border-t">
              <Button variant="outline" size="sm" onClick={() => handleCopyFindingId(finding.id)}>
                <CopyIcon />
                Copy Finding ID
              </Button>
              <ProjectPermissionCan
                I={ProjectPermissionSecretScanningFindingActions.Update}
                a={ProjectPermissionSub.SecretScanningFindings}
              >
                {(isAllowed) =>
                  finding.status === SecretScanningFindingStatus.Unresolved ? (
                    <ButtonGroup>
                      <Button
                        variant="success"
                        size="sm"
                        isDisabled={!isAllowed}
                        onClick={() => onChangeStatus(SecretScanningFindingStatus.Resolved)}
                      >
                        Mark Resolved
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="success"
                            size="sm"
                            aria-label="More status options"
                            isDisabled={!isAllowed}
                          >
                            <ChevronDownIcon />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              onChangeStatus(SecretScanningFindingStatus.FalsePositive)
                            }
                          >
                            Mark False Positive
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onChangeStatus(SecretScanningFindingStatus.Ignore)}
                          >
                            Ignore
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ButtonGroup>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      isDisabled={!isAllowed || isReopening}
                      isPending={isReopening}
                      onClick={() => onChangeStatus(SecretScanningFindingStatus.Unresolved)}
                    >
                      Reopen
                    </Button>
                  )
                }
              </ProjectPermissionCan>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
