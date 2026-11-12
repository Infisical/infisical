import { format } from "date-fns";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

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
import {
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import {
  SecretScanningFindingStatus,
  TSecretScanningFinding,
  useListSecretScanningFindingLocations
} from "@app/hooks/api/secretScanningV2";

import { FindingLocationList } from "./FindingLocationList";
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
  // the newest location's rule description stands for the finding's
  const { data: locationPages } = useListSecretScanningFindingLocations(finding?.id ?? "");
  const latestLocation = locationPages?.pages[0]?.locations[0];

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
              {latestLocation && (
                <SheetDescription>{latestLocation.details.description}</SheetDescription>
              )}
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-4">
                <Detail>
                  <DetailLabel>
                    {RESOURCE_DESCRIPTION_HELPER[finding.dataSourceType].singularTitle}
                  </DetailLabel>
                  <DetailValue>{finding.resourceName}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Last Detected</DetailLabel>
                  <DetailValue>{formatDate(finding.lastDetectedAt)}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>First Detected</DetailLabel>
                  <DetailValue>{formatDate(finding.createdAt)}</DetailValue>
                </Detail>
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
              <FindingLocationList findingId={finding.id} locationCount={finding.locationCount} />
            </div>

            <Separator />
            <SheetFooter>
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
