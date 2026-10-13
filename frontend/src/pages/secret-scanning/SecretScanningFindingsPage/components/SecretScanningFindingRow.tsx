import { useCallback } from "react";
import { format } from "date-fns";
import { CheckIcon, CopyIcon, EllipsisVerticalIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Checkbox,
  Detail,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  ProviderIcon,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  SECRET_SCANNING_DATA_SOURCE_MAP,
  SECRET_SCANNING_FINDING_STATUS_MAP
} from "@app/helpers/secretScanningV2";
import { useToggle } from "@app/hooks";
import { TSecretScanningFinding } from "@app/hooks/api/secretScanningV2";

type Props = {
  isSelected: boolean;
  onToggleSelect: (e: boolean) => void;
  finding: TSecretScanningFinding;
  onUpdate: (finding: TSecretScanningFinding) => void;
};

export const SecretScanningFindingRow = ({
  isSelected,
  onToggleSelect,
  finding,
  onUpdate
}: Props) => {
  const {
    resourceName,
    id,
    dataSourceType,
    createdAt,
    dataSourceName,
    rule,
    status,
    details,
    triageComment
  } = finding;

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(
    (idToCopy: string) => {
      setIsIdCopied.on();
      navigator.clipboard.writeText(idToCopy);

      createNotification({
        text: "Resource ID copied to clipboard",
        type: "info"
      });

      const timer = setTimeout(() => setIsIdCopied.off(), 2000);

      // eslint-disable-next-line consistent-return
      return () => clearTimeout(timer);
    },
    [isIdCopied]
  );

  const sourceDetails = SECRET_SCANNING_DATA_SOURCE_MAP[dataSourceType];

  const [isExpanded, setIsExpanded] = useToggle(false);

  const StatusIcon = SECRET_SCANNING_FINDING_STATUS_MAP[status].Icon;

  return (
    <>
      <TableRow onClick={setIsExpanded.toggle} className="group" key={`resource-${id}`}>
        <TableCell className="pr-0">
          <Checkbox
            id={`checkbox-${id}`}
            aria-label={`Select finding ${rule} in ${resourceName}`}
            isChecked={isSelected}
            onCheckedChange={() => onToggleSelect(!isSelected)}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        </TableCell>
        <TableCell isTruncatable className="min-w-16">
          <div className="flex w-full items-center">
            <ProviderIcon
              alt={`${sourceDetails.name} Data Source`}
              icon={sourceDetails.image}
              className="w-5"
            />
            <p className="ml-2 truncate">{sourceDetails.name}</p>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1 whitespace-nowrap">
            <p>{format(createdAt, "MMM dd yyyy")}</p>
            <p className="text-label">{format(createdAt, "h:mm aa")}</p>
          </div>
        </TableCell>
        <TableCell isTruncatable className="min-w-32">
          <div className="w-full items-center">
            <p className="truncate">{resourceName}</p>
            <p className="truncate text-xs text-muted">{dataSourceName}</p>
          </div>
        </TableCell>
        <TableCell>{rule}</TableCell>
        <TableCell>
          <Tooltip hoverable delayDuration={50} open={triageComment ? undefined : false}>
            <TooltipTrigger asChild>
              <Badge variant={SECRET_SCANNING_FINDING_STATUS_MAP[status].variant}>
                <StatusIcon />
                <span className="capitalize">{status.replace("-", " ")}</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm">
              {triageComment}
            </TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell variant="action">
          <DropdownMenu>
            <Tooltip hoverable delayDuration={50}>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <IconButton aria-label="Options" variant="ghost" size="xs">
                    <EllipsisVerticalIcon />
                  </IconButton>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Options</TooltipContent>
            </Tooltip>
            <DropdownMenuContent sideOffset={2} align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyId(id);
                }}
              >
                {isIdCopied ? <CheckIcon /> : <CopyIcon />}
                Copy Finding ID
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={7} className="h-auto max-w-0 border-none! p-0 whitespace-normal">
          <div
            className={`w-full bg-surface-base/75 transition-all duration-500 ${
              isExpanded ? "max-h-200 overflow-y-auto opacity-100" : "max-h-0 overflow-hidden"
            }`}
          >
            <div className="grid gap-4 p-4 2xl:grid-cols-6">
              <Detail className="col-span-full">
                <DetailLabel>Description</DetailLabel>
                <DetailValue className="truncate">
                  {details.description || <span className="text-muted italic">None</span>}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Date</DetailLabel>
                <DetailValue className="truncate">
                  {format(details.date, "MMM dd yyyy h:mm aa")}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Author</DetailLabel>
                <DetailValue className="truncate">
                  {details.author || <span className="text-muted italic">None</span>}
                </DetailValue>
              </Detail>
              <Detail className="col-span-4">
                <DetailLabel>Email</DetailLabel>
                <DetailValue className="truncate">
                  {details.email || <span className="text-muted italic">None</span>}
                </DetailValue>
              </Detail>
              <Detail className="col-span-full">
                <DetailLabel>File</DetailLabel>
                <DetailValue className="truncate">
                  {details.file || <span className="text-muted italic">None</span>}
                </DetailValue>
              </Detail>
              <Detail className="col-span-full">
                <DetailLabel>Commit</DetailLabel>
                <DetailValue className="truncate">
                  {details.commit || <span className="text-muted italic">None</span>}
                </DetailValue>
              </Detail>
              <Detail className="col-span-full">
                <DetailLabel>Commit Message</DetailLabel>
                <DetailValue>
                  <div className="max-h-48 overflow-y-auto">{details.message}</div>
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Start Line</DetailLabel>
                <DetailValue>
                  {details.startLine || <span className="text-muted italic">None</span>}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>End Line</DetailLabel>
                <DetailValue>
                  {details.endLine || <span className="text-muted italic">None</span>}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Start Column</DetailLabel>
                <DetailValue>
                  {details.startColumn || <span className="text-muted italic">None</span>}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>End Column</DetailLabel>
                <DetailValue>
                  {details.endColumn || <span className="text-muted italic">None</span>}
                </DetailValue>
              </Detail>
              <Detail className="col-span-full">
                <DetailLabel>Link</DetailLabel>
                <DetailValue>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer text-label underline underline-offset-2 hover:text-foreground"
                    href={details.link}
                  >
                    {details.link}
                  </a>
                </DetailValue>
              </Detail>
              <div className="col-span-full flex items-center border-t border-border-strong" />
              <ProjectPermissionCan
                I={ProjectPermissionSecretScanningFindingActions.Update}
                a={ProjectPermissionSub.SecretScanningFindings}
              >
                {(isAllowed) => (
                  <Button
                    onClick={() => onUpdate(finding)}
                    variant="outline"
                    isDisabled={!isAllowed}
                  >
                    <StatusIcon
                      className={twMerge(
                        "size-4",
                        SECRET_SCANNING_FINDING_STATUS_MAP[status].className
                      )}
                    />
                    Update Status
                  </Button>
                )}
              </ProjectPermissionCan>
              {Boolean(triageComment) && (
                <Detail className="col-span-3">
                  <DetailLabel>Remarks</DetailLabel>
                  <DetailValue>
                    {triageComment || <span className="text-muted italic">None</span>}
                  </DetailValue>
                </Detail>
              )}
            </div>
          </div>
        </TableCell>
      </TableRow>
    </>
  );
};
