import { useState } from "react";
import { subject } from "@casl/ability";
import { useParams } from "@tanstack/react-router";
import { EllipsisIcon, EyeIcon, LockIcon, PencilIcon, Trash2Icon } from "lucide-react";

import { VariablePermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { IdentityAuthMethod, identityAuthToNameMap } from "@app/hooks/api";
import { IdentityAuthMethodModal } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAuthMethodModal";

import { IdentityAuthRevokeDialog } from "./helpers";
import { IdentityAuthMethodSheet } from "./IdentityAuthMethodSheet";

type Props = {
  identityId: string;
  identityName: string;
  authMethods: IdentityAuthMethod[];
  activeLockoutAuthMethods: IdentityAuthMethod[];
  onMutated: () => void;
};

export const IdentityAuthMethodsTable = ({
  identityId,
  identityName,
  authMethods,
  activeLockoutAuthMethods,
  onMutated
}: Props) => {
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<IdentityAuthMethod | null>(null);
  const [revokeAuthMethod, setRevokeAuthMethod] = useState<IdentityAuthMethod | null>(null);

  const { projectId } = useParams({ strict: false });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "identityAuthMethod",
    "upgradePlan"
  ] as const);

  const handleEdit = (authMethod: IdentityAuthMethod) => {
    handlePopUpOpen("identityAuthMethod", {
      identityId,
      name: identityName,
      allAuthMethods: authMethods,
      authMethod
    });
  };

  const handleRevoke = (authMethod: IdentityAuthMethod) => {
    setRevokeAuthMethod(authMethod);
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Auth Method</TableHead>
            <TableHead className="w-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {authMethods.map((authMethod) => {
            const isLockedOut = activeLockoutAuthMethods?.includes(authMethod);
            return (
              <TableRow
                key={authMethod}
                className="cursor-pointer"
                onClick={() => setSelectedAuthMethod(authMethod)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    {identityAuthToNameMap[authMethod]}
                    {isLockedOut && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge isSquare variant="danger">
                            <LockIcon />
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>Auth method has active lockouts</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton variant="ghost" size="xs" aria-label="Auth method actions">
                        <EllipsisIcon />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setSelectedAuthMethod(authMethod)}>
                        <EyeIcon />
                        View Auth Method
                      </DropdownMenuItem>
                      <VariablePermissionCan
                        type={projectId ? "project" : "org"}
                        I={
                          projectId
                            ? ProjectPermissionIdentityActions.EditAuth
                            : OrgPermissionIdentityActions.EditAuth
                        }
                        a={
                          projectId
                            ? subject(ProjectPermissionSub.Identity, { identityId })
                            : OrgPermissionSubjects.Identity
                        }
                      >
                        {(isAllowed) => (
                          <DropdownMenuItem
                            isDisabled={!isAllowed}
                            onClick={() => handleEdit(authMethod)}
                          >
                            <PencilIcon />
                            Edit Auth Method
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
                            ? subject(ProjectPermissionSub.Identity, { identityId })
                            : OrgPermissionSubjects.Identity
                        }
                      >
                        {(isAllowed) => (
                          <DropdownMenuItem
                            variant="danger"
                            isDisabled={!isAllowed}
                            onClick={() => handleRevoke(authMethod)}
                          >
                            <Trash2Icon />
                            Remove Auth Method
                          </DropdownMenuItem>
                        )}
                      </VariablePermissionCan>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {selectedAuthMethod && (
        <IdentityAuthMethodSheet
          open={selectedAuthMethod !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedAuthMethod(null);
          }}
          identityId={identityId}
          identityName={identityName}
          authMethod={selectedAuthMethod}
          allAuthMethods={authMethods}
          isLockedOut={activeLockoutAuthMethods?.includes(selectedAuthMethod) ?? false}
          onMutated={onMutated}
        />
      )}
      <IdentityAuthMethodModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <IdentityAuthRevokeDialog
        open={revokeAuthMethod !== null}
        onOpenChange={(open) => {
          if (!open) setRevokeAuthMethod(null);
        }}
        identityId={identityId}
        authMethod={revokeAuthMethod}
        onSuccess={onMutated}
      />
    </>
  );
};
