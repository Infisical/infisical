import { useState } from "react";
import { EllipsisIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v3";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  useDeleteResourceAwsAuth,
  useDeleteResourceTokenAuth
} from "@app/hooks/api/resourceAuthMethods";

import { GatewayAuthMethod, gatewayAuthMethodToNameMap } from "./AuthMethodComponentMap";
import { EnrollmentTokenDialog } from "./EnrollmentTokenDialog";
import { ViewGatewayAwsAuthContent } from "./ViewGatewayAwsAuthContent";
import { ViewGatewayTokenAuthContent } from "./ViewGatewayTokenAuthContent";

type Props = {
  gatewayId: string;
  gatewayName: string;
  attachedMethods: GatewayAuthMethod[];
  onEdit: (method: GatewayAuthMethod) => void;
};

export const ViewGatewayAuth = ({ gatewayId, gatewayName, attachedMethods, onEdit }: Props) => {
  const [revokeMethod, setRevokeMethod] = useState<GatewayAuthMethod | null>(null);
  const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null);

  const { mutateAsync: revokeAws } = useDeleteResourceAwsAuth();
  const { mutateAsync: revokeToken } = useDeleteResourceTokenAuth();

  const handleRevoke = async () => {
    if (!revokeMethod) return;
    try {
      const resource = { type: "gateway" as const, id: gatewayId };
      if (revokeMethod === "aws") await revokeAws({ resource });
      else await revokeToken({ resource });

      createNotification({ type: "success", text: "Auth method removed" });
    } finally {
      setRevokeMethod(null);
    }
  };

  return (
    <>
      <Accordion type={attachedMethods.length === 1 ? "single" : "multiple"} collapsible>
        {attachedMethods.map((method) => (
          <AccordionItem key={method} value={method}>
            <AccordionTrigger>
              <span className="mr-auto">{gatewayAuthMethodToNameMap[method]}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="ghost" size="xs">
                    <EllipsisIcon />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {method !== "token" && (
                    <OrgPermissionCan
                      I={OrgGatewayPermissionActions.EditGateways}
                      a={OrgPermissionSubjects.Gateway}
                    >
                      {(isAllowed) => (
                        <DropdownMenuItem
                          isDisabled={!isAllowed}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(method);
                          }}
                        >
                          Edit Auth Method
                        </DropdownMenuItem>
                      )}
                    </OrgPermissionCan>
                  )}
                  <OrgPermissionCan
                    I={OrgGatewayPermissionActions.EditGateways}
                    a={OrgPermissionSubjects.Gateway}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        isDisabled={!isAllowed}
                        variant="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRevokeMethod(method);
                        }}
                      >
                        Remove Auth Method
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            </AccordionTrigger>
            <AccordionContent>
              {method === "aws" && (
                <ViewGatewayAwsAuthContent gatewayId={gatewayId} gatewayName={gatewayName} />
              )}
              {method === "token" && (
                <ViewGatewayTokenAuthContent
                  gatewayId={gatewayId}
                  onTokenGenerated={setEnrollmentToken}
                />
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <DeleteActionModal
        isOpen={Boolean(revokeMethod)}
        title={`Remove ${revokeMethod ? gatewayAuthMethodToNameMap[revokeMethod] : "auth method"}?`}
        subTitle="This blocks future logins and terminates any active session immediately."
        onChange={(isOpen) => !isOpen && setRevokeMethod(null)}
        deleteKey="confirm"
        buttonText="Remove"
        onDeleteApproved={handleRevoke}
      />

      {enrollmentToken && (
        <EnrollmentTokenDialog
          isOpen
          onOpenChange={(open) => !open && setEnrollmentToken(null)}
          gatewayName={gatewayName}
          enrollmentToken={enrollmentToken}
        />
      )}
    </>
  );
};
