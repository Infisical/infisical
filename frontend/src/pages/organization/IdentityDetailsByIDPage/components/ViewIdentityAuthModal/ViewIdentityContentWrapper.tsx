import { ReactNode } from "react";
import { faChevronDown, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2";

type Props = {
  children: ReactNode;
  onEdit: VoidFunction;
  onDelete: VoidFunction;
};

export const ViewIdentityContentWrapper = ({ children, onDelete, onEdit }: Props) => {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-end justify-between border-b border-mineshaft-500 pb-2">
          <span className="text-bunker-300">Details</span>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="xs"
                  rightIcon={<FontAwesomeIcon className="ml-1" icon={faChevronDown} />}
                  colorSchema="secondary"
                >
                  Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="min-w-[120px]" align="end">
                <DropdownMenuItem onClick={onEdit} icon={<FontAwesomeIcon icon={faEdit} />}>
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete} icon={<FontAwesomeIcon icon={faTrash} />}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">{children}</div>
      </div>
    </div>
  );
};
