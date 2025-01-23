import { ReactNode } from "react";
import { faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";

type Props = {
  children: ReactNode;
  onEdit: VoidFunction;
  onDelete: VoidFunction;
};

export const ViewIdentityContentWrapper = ({ children, onDelete, onEdit }: Props) => {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-baseline justify-between border-b border-mineshaft-500 pb-1">
          <span className="text-sm text-bunker-300">Details</span>
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              onClick={onEdit}
              leftIcon={<FontAwesomeIcon icon={faEdit} />}
              colorSchema="secondary"
            >
              Edit
            </Button>
            <Button
              size="xs"
              onClick={onDelete}
              leftIcon={<FontAwesomeIcon icon={faTrash} />}
              colorSchema="danger"
            >
              Delete
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">{children}</div>
      </div>
    </div>
  );
};
