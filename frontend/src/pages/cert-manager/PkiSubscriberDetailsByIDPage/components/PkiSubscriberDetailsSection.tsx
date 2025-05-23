import { useState } from "react";
import { subject } from "@casl/ability";
import { faCheck, faCopy, faPencil } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  GenericFieldLabel,
  IconButton,
  Modal,
  ModalContent,
  Tooltip
} from "@app/components/v2";
import {
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
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
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace.id;
  const { permission } = useProjectPermission();
  const [certificateDetails, setCertificateDetails] = useState<TCertificateDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copyTextId, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  const { data: pkiSubscriber } = useGetPkiSubscriber(
    {
      subscriberName,
      projectId
    },
    {
      refetchInterval: 5000
    }
  );

  const { mutateAsync: issuePkiSubscriberCert, isPending: isIssuingCert } =
    useIssuePkiSubscriberCert();

  const { mutateAsync: orderPkiSubscriberCert, isPending: isOrderingCert } =
    useOrderPkiSubscriberCert();

  const onIssuePkiSubscriberCert = async () => {
    try {
      if (pkiSubscriber?.supportsImmediateCertIssuance) {
        const response = await issuePkiSubscriberCert({ subscriberName, projectId });

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
        await orderPkiSubscriberCert({ subscriberName, projectId });

        createNotification({
          text: "Successfully ordered certificate. It will be issued after CA processing which could take a few minutes.",
          type: "info"
        });
      }
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to issue certificate",
        type: "error"
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
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">PKI Subscriber Details</h3>
        <ProjectPermissionCan
          I={ProjectPermissionPkiSubscriberActions.Edit}
          a={ProjectPermissionSub.PkiSubscribers}
        >
          {(isAllowed) => {
            return (
              <Tooltip content="Edit PKI Subscriber">
                <IconButton
                  isDisabled={!isAllowed}
                  ariaLabel="edit icon"
                  variant="plain"
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
              </Tooltip>
            );
          }}
        </ProjectPermissionCan>
      </div>
      <div className="pt-4">
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">PKI Subscriber ID</p>
          <div className="group flex align-top">
            <p className="text-sm text-mineshaft-300">{pkiSubscriber.id}</p>
            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <Tooltip content={copyTextId}>
                <IconButton
                  ariaLabel="copy icon"
                  variant="plain"
                  className="group relative ml-2"
                  onClick={() => {
                    navigator.clipboard.writeText(pkiSubscriber.id);
                    setCopyTextId("Copied");
                  }}
                >
                  <FontAwesomeIcon icon={isCopyingId ? faCheck : faCopy} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Name</p>
          <p className="text-sm text-mineshaft-300">{pkiSubscriber.name}</p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Status</p>
          <p className="text-sm text-mineshaft-300">
            {pkiSubscriberStatusToNameMap[pkiSubscriber.status]}
          </p>
        </div>
        <div className="mb-4">
          <p className="text-sm font-semibold text-mineshaft-300">Common Name</p>
          <p className="text-sm text-mineshaft-300">{pkiSubscriber.commonName}</p>
        </div>
        {pkiSubscriber.lastOperationAt && (
          <div className="mb-4">
            <p className="text-sm font-semibold text-mineshaft-300">Last Operation (Local Time)</p>
            <p className="text-sm text-mineshaft-300">
              {new Date(pkiSubscriber.lastOperationAt).toLocaleString()}
            </p>
          </div>
        )}
        {pkiSubscriber.lastOperationStatus === SubscriberOperationStatus.FAILED && (
          <div className="mb-4">
            <GenericFieldLabel labelClassName="text-red" label="Last Operation Status">
              <p className="break-words rounded bg-mineshaft-600 p-2 text-xs">
                {pkiSubscriber.lastOperationMessage}
              </p>
            </GenericFieldLabel>
          </div>
        )}
        {canIssuePkiSubscriberCert && (
          <Button
            className="mt-2 w-full"
            colorSchema="primary"
            type="button"
            isLoading={isIssuingCert || isOrderingCert}
            onClick={() => {
              onIssuePkiSubscriberCert();
            }}
          >
            {pkiSubscriber?.supportsImmediateCertIssuance
              ? "Issue Certificate"
              : "Order Certificate"}
          </Button>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onOpenChange={(isOpen) => {
          setIsModalOpen(isOpen);
          if (!isOpen) {
            setCertificateDetails(null);
          }
        }}
      >
        <ModalContent title="Certificate Details">
          {certificateDetails && (
            <CertificateContent
              serialNumber={certificateDetails.serialNumber}
              certificate={certificateDetails.certificate}
              certificateChain={certificateDetails.certificateChain}
              privateKey={certificateDetails.privateKey}
            />
          )}
        </ModalContent>
      </Modal>
    </div>
  ) : (
    <div />
  );
};
