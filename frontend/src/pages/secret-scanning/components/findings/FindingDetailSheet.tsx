import { format } from "date-fns";
import { ChevronDownIcon, ChevronUpIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  ButtonGroup,
  Detail,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  ProviderIcon,
  Separator,
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
  SecretScanningDataSource,
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

const AuthorDetail = ({ label, finding }: { label: string; finding: TSecretScanningFinding }) => (
  <Detail>
    <DetailLabel>{label}</DetailLabel>
    <DetailValue>
      {finding.details.author || finding.details.email}
      {finding.details.author && finding.details.email && (
        <p className="text-xs text-muted">{finding.details.email}</p>
      )}
    </DetailValue>
  </Detail>
);

const FingerprintDetail = ({ fingerprint }: { fingerprint: string }) => (
  <Detail>
    <DetailLabel>Fingerprint</DetailLabel>
    <DetailValue>
      <span className="text-xs break-all text-muted">{fingerprint}</span>
    </DetailValue>
  </Detail>
);

const FindingSourceDetails = ({ finding }: { finding: TSecretScanningFinding }) => {
  // Claude Code findings come from a submitted prompt, so there is no file, commit, or link
  if (finding.dataSourceType === SecretScanningDataSource.ClaudeCode) {
    const { startLine, startColumn, date, cwd, sessionId } = finding.details;

    return (
      <>
        <Detail>
          <DetailLabel>Location</DetailLabel>
          <DetailValue>
            Prompt line {startLine}, column {startColumn}
          </DetailValue>
        </Detail>
        <FingerprintDetail fingerprint={finding.fingerprint} />
        <AuthorDetail label="Developer" finding={finding} />
        <Detail>
          <DetailLabel>Submitted</DetailLabel>
          <DetailValue>{formatDate(date)}</DetailValue>
        </Detail>
        {cwd && (
          <Detail className="col-span-2">
            <DetailLabel>Working Directory</DetailLabel>
            <DetailValue>
              <span className="font-mono text-xs break-all">{cwd}</span>
            </DetailValue>
          </Detail>
        )}
        {sessionId && (
          <Detail className="col-span-2">
            <DetailLabel>Session ID</DetailLabel>
            <DetailValue>
              <span className="font-mono text-xs break-all">{sessionId}</span>
            </DetailValue>
          </Detail>
        )}
      </>
    );
  }

  return (
    <>
      <Detail>
        <DetailLabel>File</DetailLabel>
        <DetailValue>
          {finding.details.link ? (
            <a
              href={finding.details.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:underline hover:underline-offset-2"
            >
              <ExternalLinkIcon className="size-3.5 shrink-0" />
              {finding.details.file}:{finding.details.startLine}
            </a>
          ) : (
            `${finding.details.file}:${finding.details.startLine}`
          )}
        </DetailValue>
      </Detail>
      <FingerprintDetail fingerprint={finding.fingerprint} />
      <Detail>
        <DetailLabel>Commit</DetailLabel>
        <DetailValue>
          {finding.details.commit.slice(0, 7)}
          {finding.details.message && (
            <p className="line-clamp-3 text-xs text-muted">{finding.details.message}</p>
          )}
        </DetailValue>
      </Detail>
      <AuthorDetail label="Author" finding={finding} />
      <Detail>
        <DetailLabel>Committed</DetailLabel>
        <DetailValue>{formatDate(finding.details.date)}</DetailValue>
      </Detail>
    </>
  );
};

export const FindingDetailSheet = ({
  finding,
  position,
  onClose,
  onPrevious,
  onNext,
  onChangeStatus,
  isReopening
}: Props) => {
  return (
    <Sheet open={Boolean(finding)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="form" onOpenAutoFocus={(event) => event.preventDefault()}>
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
                <SheetTitle>{finding.rule}</SheetTitle>
                <FindingStatusBadge status={finding.status} />
              </div>
              <SheetDescription>{finding.details.description}</SheetDescription>
            </SheetHeader>

            <div className="grid flex-1 grid-cols-2 content-start gap-4 overflow-y-auto p-4">
              <FindingSourceDetails finding={finding} />
              {finding.triageComment && (
                <Detail className="col-span-2">
                  <DetailLabel>Comment</DetailLabel>
                  <DetailValue>
                    <p className="whitespace-pre-wrap">{finding.triageComment}</p>
                  </DetailValue>
                </Detail>
              )}
            </div>

            <Separator />
            <SheetFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(finding.fingerprint);
                  createNotification({ type: "info", text: "Fingerprint copied to clipboard" });
                }}
              >
                <CopyIcon />
                Copy Fingerprint
              </Button>
              <div className="ml-auto">
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
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
