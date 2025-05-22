import { useCallback } from "react";
import { faCheck, faCopy, faEllipsisV } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import {
  TSecretScanningDataSourceWithDetails,
  TSecretScanningResource
} from "@app/hooks/api/secretScanningV2";

type Props = {
  resource: TSecretScanningResource;
  onTriggerScan: (dataSource: TSecretScanningDataSourceWithDetails) => void;
};

export const SecretScanningResourceRow = ({ resource, onTriggerScan }: Props) => {
  const navigate = useNavigate();
  const { id, name } = resource;

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(id);

    createNotification({
      text: "Resource ID copied to clipboard",
      type: "info"
    });

    const timer = setTimeout(() => setIsIdCopied.off(), 2000);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timer);
  }, [isIdCopied]);

  return (
    <Tr
      className={twMerge(
        "group h-10 transition-colors duration-100 hover:bg-mineshaft-700"
        // unresolvedFindings && "bg-yellow/5 hover:bg-yellow/10",
        // lastScanStatus === SecretScanningScanStatus.Failed && "bg-red/5 hover:bg-red/10"
      )}
      key={`resource-${id}`}
    >
      <Td className="!min-w-[8rem] max-w-0">
        <div className="flex w-full items-center">
          <p className="truncate">{name}</p>
        </div>
      </Td>
      <Td>
        {/* eslint-disable-next-line no-nested-ternary */}
        {/* {lastScannedAt && lastScanStatus?.match(/complete|failed/) ? ( */}
        {/*  unresolvedFindings ? ( */}
        {/*    <Badge */}
        {/*      variant="primary" */}
        {/*      className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap" */}
        {/*    > */}
        {/*      <FontAwesomeIcon icon={faWarning} /> */}
        {/*      <span> */}
        {/*        {unresolvedFindings} Secret{unresolvedFindings > 1 ? "s" : ""} Detected */}
        {/*      </span> */}
        {/*    </Badge> */}
        {/*  ) : ( */}
        {/*    <Badge */}
        {/*      variant="success" */}
        {/*      className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap" */}
        {/*    > */}
        {/*      <FontAwesomeIcon icon={faCheck} /> */}
        {/*      No Secrets Detected */}
        {/*    </Badge> */}
        {/*  ) */}
        {/* ) : ( */}
        {/*  "-" */}
        {/* )} */}-
      </Td>
      <Td>
        {/* <span> */}
        {/*  {lastScannedAt */}
        {/*    ? formatDistance(new Date(lastScannedAt), new Date(), { addSuffix: true }) */}
        {/*    : "-"} */}
        {/* </span> */}-
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
                  handleCopyId();
                }}
              >
                Copy Data Source ID
              </DropdownMenuItem>
              {/* <ProjectPermissionCan */}
              {/*  I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans} */}
              {/*  a={ProjectPermissionSub.SecretScanningDataSources} */}
              {/* > */}
              {/*  {(isAllowed: boolean) => ( */}
              {/*    <DropdownMenuItem */}
              {/*      icon={<FontAwesomeIcon icon={faRotate} />} */}
              {/*      onClick={(e) => { */}
              {/*        e.stopPropagation(); */}
              {/*        onTriggerScan(dataSource); */}
              {/*      }} */}
              {/*      isDisabled={!isAllowed} */}
              {/*    > */}
              {/*      <Tooltip */}
              {/*        position="left" */}
              {/*        sideOffset={42} */}
              {/*        content={`Manually trigger a scan for this ${sourceDetails.name} data source.`} */}
              {/*      > */}
              {/*        <div className="flex h-full w-full items-center justify-between gap-1"> */}
              {/*          <span> Trigger Scan</span> */}
              {/*          <FontAwesomeIcon */}
              {/*            className="text-bunker-300" */}
              {/*            size="sm" */}
              {/*            icon={faInfoCircle} */}
              {/*          /> */}
              {/*        </div> */}
              {/*      </Tooltip> */}
              {/*    </DropdownMenuItem> */}
              {/*  )} */}
              {/* </ProjectPermissionCan> */}
              {/* <ProjectPermissionCan */}
              {/*  I={ProjectPermissionSecretScanningDataSourceActions.Edit} */}
              {/*  a={ProjectPermissionSub.SecretScanningDataSources} */}
              {/* > */}
              {/*  {(isAllowed: boolean) => ( */}
              {/*    <DropdownMenuItem */}
              {/*      isDisabled={!isAllowed} */}
              {/*      icon={<FontAwesomeIcon icon={isAutoScanEnabled ? faToggleOff : faToggleOn} />} */}
              {/*      onClick={(e) => { */}
              {/*        e.stopPropagation(); */}
              {/*        onToggleEnableAutoScan(dataSource); */}
              {/*      }} */}
              {/*    > */}
              {/*      {isAutoScanEnabled ? "Disable" : "Enable"} Auto-Scan */}
              {/*    </DropdownMenuItem> */}
              {/*  )} */}
              {/* </ProjectPermissionCan> */}
              {/* <ProjectPermissionCan */}
              {/*  I={ProjectPermissionSecretScanningDataSourceActions.Edit} */}
              {/*  a={ProjectPermissionSub.SecretScanningDataSources} */}
              {/* > */}
              {/*  {(isAllowed: boolean) => ( */}
              {/*    <DropdownMenuItem */}
              {/*      isDisabled={!isAllowed} */}
              {/*      icon={<FontAwesomeIcon icon={faEdit} />} */}
              {/*      onClick={(e) => { */}
              {/*        e.stopPropagation(); */}
              {/*        onEdit(dataSource); */}
              {/*      }} */}
              {/*    > */}
              {/*      Edit Data Source */}
              {/*    </DropdownMenuItem> */}
              {/*  )} */}
              {/* </ProjectPermissionCan> */}
              {/* <ProjectPermissionCan */}
              {/*  I={ProjectPermissionSecretScanningDataSourceActions.Delete} */}
              {/*  a={ProjectPermissionSub.SecretScanningDataSources} */}
              {/* > */}
              {/*  {(isAllowed: boolean) => ( */}
              {/*    <DropdownMenuItem */}
              {/*      isDisabled={!isAllowed} */}
              {/*      icon={<FontAwesomeIcon icon={faTrash} />} */}
              {/*      onClick={(e) => { */}
              {/*        e.stopPropagation(); */}
              {/*        onDelete(dataSource); */}
              {/*      }} */}
              {/*    > */}
              {/*      Delete Data Source */}
              {/*    </DropdownMenuItem> */}
              {/*  )} */}
              {/* </ProjectPermissionCan> */}
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      </Td>
    </Tr>
  );
};
