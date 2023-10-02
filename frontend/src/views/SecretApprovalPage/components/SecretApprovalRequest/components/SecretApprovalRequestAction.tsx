import { faCheck, faClose } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";

type Props = {
  hasMerged?: boolean;
  status: "close" | "open";
  isMergable?: boolean;
  isMerging?: boolean;
  onMerge: () => void;
  onClose?: () => void;
};
export const SecretApprovalRequestAction = ({
  hasMerged,
  status,
  isMergable,
  onMerge,
  isMerging,
  onClose
}: Props) => {
  if (!hasMerged && status === "open") {
    return (
      <>
        <Button
          leftIcon={<FontAwesomeIcon icon={faCheck} />}
          isDisabled={!isMergable}
          isLoading={isMerging}
          onClick={onMerge}
        >
          Merge
        </Button>
        <Button
          onClick={onClose}
          variant="outline_bg"
          leftIcon={<FontAwesomeIcon icon={faClose} />}
        >
          Close request
        </Button>
      </>
    );
  }

  if (hasMerged && status === "close") return <span>This approval request has been merged</span>;

  return <span>This approval request has been closed</span>;
};
