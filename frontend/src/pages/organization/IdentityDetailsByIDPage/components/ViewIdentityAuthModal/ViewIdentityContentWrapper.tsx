import { ReactNode } from "react";
import { subject } from "@casl/ability";
import { faChevronDown, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useParams } from "@tanstack/react-router";

import { VariablePermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context";

type Props = {
  children: ReactNode;
  onEdit: VoidFunction;
  onDelete: VoidFunction;
  identityId: string;
};

export const ViewIdentityContentWrapper = ({ children, onDelete, onEdit, identityId }: Props) => {
  const { projectId } = useParams({
    strict: false
  });

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
              <DropdownMenuContent className="mt-3 min-w-[120px]" align="end">
                <VariablePermissionCan
                  type={projectId ? "project" : "org"}
                  I={
                    projectId
                      ? ProjectPermissionIdentityActions.Edit
                      : OrgPermissionIdentityActions.Edit
                  }
                  a={
                    projectId
                      ? subject(ProjectPermissionSub.Identity, {
                          identityId
                        })
                      : OrgPermissionSubjects.Identity
                  }
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      isDisabled={!isAllowed}
                      onClick={onEdit}
                      icon={<FontAwesomeIcon icon={faEdit} />}
                    >
                      Edit
                    </DropdownMenuItem>
                  )}
                </VariablePermissionCan>
                <VariablePermissionCan
                  type={projectId ? "project" : "org"}
                  I={
                    projectId
                      ? ProjectPermissionIdentityActions.Delete
                      : OrgPermissionIdentityActions.Delete
                  }
                  a={
                    projectId
                      ? subject(ProjectPermissionSub.Identity, {
                          identityId
                        })
                      : OrgPermissionSubjects.Identity
                  }
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      isDisabled={!isAllowed}
                      onClick={onDelete}
                      icon={<FontAwesomeIcon icon={faTrash} />}
                    >
                      Delete
                    </DropdownMenuItem>
                  )}
                </VariablePermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">{children}</div>
      </div>
    </div>
  );
};
