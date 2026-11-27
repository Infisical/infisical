import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
  Toggle
} from "@app/components/v3";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";

export const OrgMcpSection = () => {
  const { currentOrg } = useOrganization();
  const { mutateAsync, isPending } = useUpdateOrg();
  const [isTurnOffOpen, setIsTurnOffOpen] = useState(false);

  const updateMcpEnabled = async (mcpEnabled: boolean) => {
    try {
      await mutateAsync({ orgId: currentOrg.id, mcpEnabled });
    } catch {
      // The request error toast already says why, and the dialog stays open to retry.
      return;
    }
    setIsTurnOffOpen(false);
    createNotification({
      text: `MCP access turned ${mcpEnabled ? "on" : "off"}`,
      type: "success"
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>
            Infisical MCP
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/mcp-server" />
          </CardTitle>
          <CardDescription>
            Control how members connect AI tools to this organization through the Infisical MCP
            server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>
                  Allow MCP Clients
                  {!currentOrg.mcpEnabled && <Badge variant="neutral">Off</Badge>}
                </FieldTitle>
                <FieldDescription>
                  Members can connect AI tools such as Claude Code and use them within their own
                  permissions.
                </FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
                {(isAllowed) => (
                  <Toggle
                    id="org-mcp-enabled"
                    variant="org"
                    checked={currentOrg.mcpEnabled}
                    onCheckedChange={(checked) =>
                      checked ? updateMcpEnabled(true) : setIsTurnOffOpen(true)
                    }
                    disabled={!isAllowed || isPending}
                    aria-label="Allow MCP clients"
                  />
                )}
              </OrgPermissionCan>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <AlertDialog isPending={isPending} open={isTurnOffOpen} onOpenChange={setIsTurnOffOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn Off MCP Access?</AlertDialogTitle>
            <AlertDialogDescription>
              Members&apos; MCP clients stop working right away, and nobody can connect a new one.
              Existing connections are kept and work again when you turn MCP access back on.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={(event) => {
                event.preventDefault();
                updateMcpEnabled(false);
              }}
            >
              Turn Off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
