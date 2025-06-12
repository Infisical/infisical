import { useCallback } from "react";
import { faCheck, faCopy, faEllipsisV } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GenericFieldLabel,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  SECRET_SCANNING_DATA_SOURCE_MAP,
  SECRET_SCANNING_FINDING_STATUS_ICON_MAP
} from "@app/helpers/secretScanningV2";
import { useToggle } from "@app/hooks";
import {
  SecretScanningFindingStatus,
  TSecretScanningFinding
} from "@app/hooks/api/secretScanningV2";

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
    remarks
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

  return (
    <>
      <Tr
        onClick={setIsExpanded.toggle}
        className={twMerge(
          "group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
        )}
        key={`resource-${id}`}
      >
        <Td className="pr-0">
          <Checkbox
            id={`checkbox-${id}`}
            isChecked={isSelected}
            onCheckedChange={() => onToggleSelect(!isSelected)}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        </Td>
        <Td className="!min-w-[4rem] max-w-0">
          <div className="flex w-full items-center">
            <img
              alt={`${sourceDetails.name} Data Source`}
              src={`/images/integrations/${sourceDetails.image}`}
              className="w-5"
            />
            <p className="ml-2 truncate">{sourceDetails.name}</p>
          </div>
        </Td>
        <Td>
          <div className="flex items-center gap-1 whitespace-nowrap">
            <p>{format(createdAt, "MMM dd yyyy")}</p>
            <p className="text-mineshaft-300">{format(createdAt, "h:mm aa")}</p>
          </div>
        </Td>
        <Td className="!min-w-[8rem] max-w-0">
          <div className="w-full items-center">
            <p className="truncate">{resourceName}</p>
            <p className="truncate text-xs text-mineshaft-400">{dataSourceName}</p>
          </div>
        </Td>
        <Td className="whitespace-nowrap">{rule}</Td>
        <Td className="whitespace-nowrap">
          <Tooltip position="left" content={remarks}>
            <div className="w-min">
              <Badge
                variant={status === SecretScanningFindingStatus.Resolved ? "success" : "primary"}
                className={twMerge(
                  "flex h-5 w-min items-center gap-1.5 whitespace-nowrap",
                  (status === SecretScanningFindingStatus.FalsePositive ||
                    status === SecretScanningFindingStatus.Ignore) &&
                    "bg-mineshaft-400/50 text-bunker-300"
                )}
              >
                <FontAwesomeIcon icon={SECRET_SCANNING_FINDING_STATUS_ICON_MAP[status].icon} />
                <span className="capitalize">{status.replace("-", " ")}</span>
              </Badge>
            </div>
          </Tooltip>
        </Td>
        <Td>
          <Tooltip className="max-w-sm text-center" content="Options">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  ariaLabel="Options"
                  colorSchema="secondary"
                  className="w-6"
                  variant="plain"
                >
                  <FontAwesomeIcon icon={faEllipsisV} />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent sideOffset={2} align="end">
                <DropdownMenuItem
                  icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyId(id);
                  }}
                >
                  Copy Finding ID
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Tooltip>
        </Td>
      </Tr>
      <Tr>
        <Td colSpan={6} className="!border-none p-0">
          <div
            className={`w-full overflow-hidden bg-mineshaft-900/75 transition-all duration-500 ${
              isExpanded ? "max-h-[50rem] opacity-100" : "max-h-0"
            }`}
          >
            <div className="grid gap-4 p-4 2xl:grid-cols-6">
              <GenericFieldLabel truncate className="col-span-full" label="Description">
                {details.description}
              </GenericFieldLabel>
              <GenericFieldLabel truncate label="Date">
                {format(details.date, "MMM dd yyyy h:mm aa")}
              </GenericFieldLabel>
              <GenericFieldLabel truncate label="Author">
                {details.author}
              </GenericFieldLabel>
              <GenericFieldLabel className="col-span-4" truncate label="Email">
                {details.email}
              </GenericFieldLabel>
              <GenericFieldLabel truncate className="col-span-full" label="File">
                {details.file}
              </GenericFieldLabel>
              <GenericFieldLabel truncate className="col-span-full" label="Commit">
                {details.commit}
              </GenericFieldLabel>
              <GenericFieldLabel className="col-span-full" label="Commit Message">
                {details.message}
              </GenericFieldLabel>
              <GenericFieldLabel label="Start Line">{details.startLine}</GenericFieldLabel>
              <GenericFieldLabel label="End Line">{details.endLine}</GenericFieldLabel>
              <GenericFieldLabel label="Start Column">{details.startColumn}</GenericFieldLabel>
              <GenericFieldLabel label="End Column">{details.endColumn}</GenericFieldLabel>
              <GenericFieldLabel className="col-span-full" label="Link">
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer text-mineshaft-300 underline underline-offset-2 hover:text-mineshaft-100"
                  href={details.link}
                >
                  {details.link}
                </a>
              </GenericFieldLabel>
              <div className="col-span-full flex items-center border-t border-mineshaft-500" />
              <ProjectPermissionCan
                I={ProjectPermissionSecretScanningFindingActions.Update}
                a={ProjectPermissionSub.SecretScanningFindings}
              >
                {(isAllowed) => (
                  <Button
                    onClick={() => onUpdate(finding)}
                    colorSchema="secondary"
                    isDisabled={!isAllowed}
                    leftIcon={
                      <FontAwesomeIcon
                        className={SECRET_SCANNING_FINDING_STATUS_ICON_MAP[status].className}
                        icon={SECRET_SCANNING_FINDING_STATUS_ICON_MAP[status].icon}
                      />
                    }
                  >
                    Update Status
                  </Button>
                )}
              </ProjectPermissionCan>
              {Boolean(remarks) && (
                <GenericFieldLabel className="col-span-3" label="Remarks">
                  {remarks}
                </GenericFieldLabel>
              )}
            </div>
          </div>
        </Td>
      </Tr>
    </>
  );
};
