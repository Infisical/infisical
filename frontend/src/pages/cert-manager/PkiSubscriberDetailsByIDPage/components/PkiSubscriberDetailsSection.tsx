import { useState } from "react";
import { subject } from "@casl/ability";
import { faCheck, faCopy, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  IconButton,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { useTimedReset } from "@app/hooks";
import {
  useGetPkiSubscriber,
  useIssuePkiSubscriberCert,
  useOrderPkiSubscriberCert
} from "@app/hooks/api";
import { pkiSubscriberStatusToNameMap } from "@app/hooks/api/pkiSubscriber/constants";
import { SubscriberOperationStatus } from "@app/hooks/api/pkiSubscriber/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "../../CertificatesPage/components/CertificateContent";

type Props = {
  subscriberName: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["pkiSubscriber"]>, data?: object) => void;
};

type TCertificateDetails = {
  serialNumber: string;
  certificate: string;
  certificateChain: string;
  privateKey: string;
};

export const PkiSubscriberDetailsSection = ({ subscriberName, handlePopUpOpen }: Props) => {
  const { permission } = useProjectPermission();
  const { currentProject } = useProject();
  const [certificateDetails, setCertificateDetails] = useState<TCertificateDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { data: pkiSubscriber } = useGetPkiSubscriber(
    {
      subscriberName,
      projectId: currentProject.id
    },
    {
      refetchInterval: 30_000
    }
  );

  const { mutateAsync: issuePkiSubscriberCert, isPending: isIssuingCert } =
    useIssuePkiSubscriberCert();

  const { mutateAsync: orderPkiSubscriberCert, isPending: isOrderingCert } =
    useOrderPkiSubscriberCert();

  const onIssuePkiSubscriberCert = async () => {
    if (pkiSubscriber?.supportsImmediateCertIssuance) {
      const response = await issuePkiSubscriberCert({ subscriberName });

      setCertificateDetails({
        serialNumber: response.serialNumber,
        certificate: response.certificate,
        certificateChain: response.certificateChain,
        privateKey: response.privateKey
      });

      setIsModalOpen(true);

      createNotification({
        text: "Successfully issued certificate",
        type: "success"
      });
    } else {
      await orderPkiSubscriberCert({ subscriberName });

      createNotification({
        text: "Successfully ordered certificate. It will be issued after CA processing which could take a few minutes.",
        type: "info"
      });
    }
  };

  const canIssuePkiSubscriberCert = permission.can(
    ProjectPermissionPkiSubscriberActions.IssueCert,
    subject(ProjectPermissionSub.PkiSubscribers, {
      name: pkiSubscriber?.name ?? ""
    })
  );

  return pkiSubscriber ? (
    <Card>
      <CardHeader>
        <CardTitle>PKI Subscriber Details</CardTitle>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionPkiSubscriberActions.Edit}
            a={ProjectPermissionSub.PkiSubscribers}
          >
            {(isAllowed) => {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <IconButton
                        isDisabled={!isAllowed}
                        aria-label="edit icon"
                        variant="ghost"
                        className="group relative"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePopUpOpen("pkiSubscriber", {
                            subscriberName: pkiSubscriber.name
                          });
                        }}
                      >
                        <FontAwesomeIcon icon={faPencil} />
                      </IconButton>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Edit PKI Subscriber</TooltipContent>
                </Tooltip>
              );
            }}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <p className="text-sm font-medium text-label">PKI Subscriber ID</p>
          <div className="group flex align-top">
            <p className="text-sm text-label">{pkiSubscriber.id}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <IconButton
                      aria-label="copy icon"
                      variant="ghost"
                      className="group relative ml-2"
                      onClick={() => {
                        navigator.clipboard.writeText(pkiSubscriber.id);
                        setCopyTextId("Copied");
                      }}
                    >
                      <FontAwesomeIcon icon={isCopyingId ? faCheck : faCopy} />
                    </IconButton>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{copyTextId}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-medium text-label">Name</p>
          <p className="text-sm text-label">{pkiSubscriber.name}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-medium text-label">Status</p>
          <p className="text-sm text-label">{pkiSubscriberStatusToNameMap[pkiSubscriber.status]}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-medium text-label">Common Name</p>
          <p className="text-sm text-label">{pkiSubscriber.commonName}</p>
        </div>
        {pkiSubscriber.lastOperationAt && (
          <div className="mb-4">
            <p className="text-sm font-medium text-label">Last Operation (Local Time)</p>
            <p className="text-sm text-label">
              {new Date(pkiSubscriber.lastOperationAt).toLocaleString()}
            </p>
          </div>
        )}
        {pkiSubscriber.lastOperationStatus === SubscriberOperationStatus.FAILED && (
          <div className="mb-4">
            <div>
              <p className="text-danger">Last Operation Status</p>
              <div className="text-sm text-foreground">
                <p className="rounded-sm bg-surface-active p-2 text-xs break-words">
                  {pkiSubscriber.lastOperationMessage}
                </p>
              </div>
            </div>
          </div>
        )}
        {canIssuePkiSubscriberCert && (
          <Button
            className="mt-2 w-full"
            type="button"
            isPending={isIssuingCert || isOrderingCert}
            onClick={() => {
              onIssuePkiSubscriberCert();
            }}
            variant="project"
          >
            {pkiSubscriber?.supportsImmediateCertIssuance
              ? "Issue Certificate"
              : "Order Certificate"}
          </Button>
        )}
      </CardContent>

      <Sheet
        open={isModalOpen}
        onOpenChange={(isOpen) => {
          setIsModalOpen(isOpen);
          if (!isOpen) {
            setCertificateDetails(null);
          }
        }}
      >
        <SheetContent size="form">
          <SheetHeader>
            <SheetTitle>Certificate Details</SheetTitle>
            <SheetDescription>View certificate details.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {certificateDetails && (
              <CertificateContent
                serialNumber={certificateDetails.serialNumber}
                certificate={certificateDetails.certificate}
                certificateChain={certificateDetails.certificateChain}
                privateKey={certificateDetails.privateKey}
              />
            )}
          </div>
          <SheetFooter className="justify-end border-t">
            <SheetClose asChild>
              <Button variant="ghost">Close</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Card>
  ) : (
    <div />
  );
};
