import { useEffect, useState } from "react";
import { InfoIcon, PlusIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
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
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DocumentationLinkBadge,
  Field,
  FieldLabel,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { OrgPermissionMachineIdentityAuthTemplateActions } from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { useDeleteOrgIdentity } from "@app/hooks/api";
import { useDeleteIdentityAuthTemplate } from "@app/hooks/api/identityAuthTemplates";
import { SubscriptionPlanTypes } from "@app/hooks/api/subscriptions/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { IdentityAuthTemplateModal } from "./IdentityAuthTemplateModal";
import { IdentityAuthTemplatesTable } from "./IdentityAuthTemplatesTable";
import { IdentityTable } from "./IdentityTable";
import { IdentityTokenAuthTokenModal } from "./IdentityTokenAuthTokenModal";
import { MachineAuthTemplateUsagesModal } from "./MachineAuthTemplateUsagesModal";
import { OrgIdentityLinkForm } from "./OrgIdentityLinkForm";
import { OrgIdentityModal } from "./OrgIdentityModal";

enum IdentityWizardSteps {
  CreateIdentity = "create-identity",
  LinkIdentity = "link-identity"
}

type Props = {
  view?: "identities" | "templates";
};

type ConfirmDeleteDialogProps = {
  isOpen: boolean;
  name: string;
  isPending: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => Promise<void>;
};

const ConfirmDeleteDialog = ({
  isOpen,
  name,
  isPending,
  onOpenChange,
  onConfirm
}: ConfirmDeleteDialogProps) => {
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!isOpen) setConfirmation("");
  }, [isOpen]);

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. Type &quot;confirm&quot; to continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="delete-identity-resource-confirmation">
            Type &quot;confirm&quot; to confirm
          </FieldLabel>
          <Input
            id="delete-identity-resource-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel isDisabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isDisabled={confirmation !== "confirm"}
            isPending={isPending}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const IdentitySectionContent = ({ view = "identities" }: Props) => {
  const { subscription } = useSubscription();
  const { currentOrg, isSubOrganization } = useOrganization();
  const orgId = currentOrg?.id || "";

  const [wizardStep, setWizardStep] = useState(IdentityWizardSteps.CreateIdentity);
  const [areAuthTemplatesEmpty, setAreAuthTemplatesEmpty] = useState(false);

  const { mutateAsync: deleteMutateAsync, isPending: isDeletingIdentity } = useDeleteOrgIdentity();
  const { mutateAsync: deleteTemplateMutateAsync, isPending: isDeletingTemplate } =
    useDeleteIdentityAuthTemplate();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "identity",
    "identityAuthMethod",
    "deleteIdentity",
    "universalAuthClientSecret",
    "deleteUniversalAuthClientSecret",
    "upgradePlan",
    "tokenAuthToken",
    "createTemplate",
    "editTemplate",
    "deleteTemplate",
    "viewUsages",
    "addOptions"
  ] as const);

  const isMoreIdentitiesAllowed = subscription?.identityLimit
    ? subscription.identitiesUsed < subscription.identityLimit
    : true;

  const isEnterprise = subscription?.slug === SubscriptionPlanTypes.Enterprise;

  const onDeleteIdentitySubmit = async (identityId: string) => {
    await deleteMutateAsync({
      identityId,
      orgId
    });

    createNotification({
      text: "Successfully deleted machine identity",
      type: "success"
    });

    handlePopUpClose("deleteIdentity");
  };

  const onDeleteTemplateSubmit = async (templateId: string) => {
    await deleteTemplateMutateAsync({
      templateId,
      organizationId: orgId
    });

    createNotification({
      text: "Successfully deleted template",
      type: "success"
    });

    handlePopUpClose("deleteTemplate");
  };

  return (
    <>
      {view === "identities" && (
        <Card>
          <CardHeader>
            <CardTitle>
              {isSubOrganization ? "Sub-Organization " : ""}Machine Identities
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/machine-identities" />
            </CardTitle>
            <CardDescription>
              All machine identities across your{" "}
              {isSubOrganization ? "sub-organization" : "organization"}, including those scoped to
              individual projects.
            </CardDescription>
            <CardAction>
              <OrgPermissionCan
                I={OrgPermissionIdentityActions.Create}
                a={OrgPermissionSubjects.Identity}
              >
                {(isAllowed) => (
                  <Button
                    variant={isSubOrganization ? "sub-org" : "org"}
                    onClick={() => {
                      if (!isMoreIdentitiesAllowed && !isEnterprise) {
                        handlePopUpOpen("upgradePlan", {
                          description:
                            "You can add more machine identities if you upgrade your Infisical Pro plan."
                        });
                        return;
                      }

                      if (!isSubOrganization) {
                        setWizardStep(IdentityWizardSteps.CreateIdentity);
                      }

                      handlePopUpOpen("identity");
                    }}
                    isDisabled={!isAllowed}
                  >
                    <PlusIcon />
                    {isSubOrganization ? "Add" : "Create"}
                  </Button>
                )}
              </OrgPermissionCan>
            </CardAction>
          </CardHeader>
          <CardContent>
            <IdentityTable handlePopUpOpen={handlePopUpOpen} />
          </CardContent>
        </Card>
      )}
      {view === "templates" && (
        <Card>
          <CardHeader>
            <CardTitle>
              Machine Identity Auth Templates
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/identities/auth-templates" />
            </CardTitle>
            <CardDescription>
              Reuse authentication configurations across machine identities to keep settings
              consistent and easier to manage.
            </CardDescription>
            <CardAction>
              <OrgPermissionCan
                I={OrgPermissionMachineIdentityAuthTemplateActions.CreateTemplates}
                a={OrgPermissionSubjects.MachineIdentityAuthTemplate}
              >
                {(isAllowed) => (
                  <Button
                    variant={isSubOrganization ? "sub-org" : "org"}
                    onClick={() => {
                      if (subscription && !subscription.machineIdentityAuthTemplates) {
                        handlePopUpOpen("upgradePlan", {
                          isEnterpriseFeature: true,
                          text: "Your current plan does not include access to creating Machine Identity Auth Templates. To unlock this feature, please upgrade to Infisical Enterprise plan."
                        });
                        return;
                      }
                      handlePopUpOpen("createTemplate");
                    }}
                    isDisabled={!isAllowed}
                  >
                    <PlusIcon />
                    Create
                  </Button>
                )}
              </OrgPermissionCan>
            </CardAction>
          </CardHeader>
          <OrgPermissionCan
            I={OrgPermissionMachineIdentityAuthTemplateActions.ListTemplates}
            a={OrgPermissionSubjects.MachineIdentityAuthTemplate}
          >
            {(isAllowed) =>
              isAllowed ? (
                <CardContent className={areAuthTemplatesEmpty ? "hidden" : undefined}>
                  <IdentityAuthTemplatesTable
                    handlePopUpOpen={handlePopUpOpen}
                    onEmptyStateChange={setAreAuthTemplatesEmpty}
                  />
                </CardContent>
              ) : null
            }
          </OrgPermissionCan>
        </Card>
      )}
      {view === "templates" && (
        <>
          <IdentityAuthTemplateModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
          <MachineAuthTemplateUsagesModal
            isOpen={popUp.viewUsages.isOpen}
            onClose={() => handlePopUpClose("viewUsages")}
            templateId={
              (popUp?.viewUsages?.data as { template: { id: string; name: string } })?.template
                ?.id || ""
            }
            templateName={
              (popUp?.viewUsages?.data as { template: { id: string; name: string } })?.template
                ?.name || ""
            }
          />
          <ConfirmDeleteDialog
            isOpen={popUp.deleteTemplate.isOpen}
            name={(popUp?.deleteTemplate?.data as { name: string })?.name || "template"}
            isPending={isDeletingTemplate}
            onOpenChange={(isOpen) => handlePopUpToggle("deleteTemplate", isOpen)}
            onConfirm={() =>
              onDeleteTemplateSubmit(
                (popUp?.deleteTemplate?.data as { templateId: string })?.templateId
              )
            }
          />
        </>
      )}
      {view === "identities" && (
        <>
          <IdentityTokenAuthTokenModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
          <Dialog
            open={popUp.identity.isOpen}
            onOpenChange={(open) => {
              handlePopUpToggle("identity", open);
              if (!open) {
                setWizardStep(IdentityWizardSteps.CreateIdentity);
              }
            }}
          >
            <DialogContent className="max-w-xl overflow-visible">
              <DialogHeader>
                <DialogTitle>
                  {isSubOrganization
                    ? "Add Machine Identity to Sub-Organization"
                    : "Create Organization Machine Identity"}
                </DialogTitle>
                <DialogDescription>
                  {isSubOrganization
                    ? "Create a new machine identity or assign an existing one"
                    : "Create a new machine identity in the organization"}
                </DialogDescription>
              </DialogHeader>
              {isSubOrganization && (
                <div className="mx-auto flex items-center gap-2">
                  <Tabs
                    value={wizardStep}
                    onValueChange={(value) => setWizardStep(value as IdentityWizardSteps)}
                  >
                    <TabsList className="w-fit">
                      <TabsTrigger value={IdentityWizardSteps.CreateIdentity}>
                        Create New
                      </TabsTrigger>
                      <TabsTrigger value={IdentityWizardSteps.LinkIdentity}>
                        Assign Existing
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Tooltip>
                    <TooltipTrigger>
                      <InfoIcon size={16} className="text-mineshaft-400" />
                    </TooltipTrigger>
                    <TooltipContent side="right" align="start" className="max-w-sm">
                      <p className="mb-2 text-mineshaft-300">
                        You can add machine identities to your sub-organization in one of two ways:
                      </p>
                      <ul className="ml-3.5 flex list-disc flex-col gap-y-4">
                        <li className="text-mineshaft-200">
                          <strong className="font-medium text-mineshaft-100">Create New</strong> -
                          Create a new machine identity specifically for this sub-organization. This
                          machine identity will be managed at the sub-organization level.
                          <p className="mt-2">
                            This method is recommended for autonomous teams that need to manage
                            machine identity authentication.
                          </p>
                        </li>
                        <li>
                          <strong className="font-medium text-mineshaft-100">
                            Assign Existing
                          </strong>{" "}
                          Assign an existing machine identity from your parent organization. The
                          machine identity will continue to be managed at its original scope.
                          <p className="mt-2">
                            This method is recommended for organizations that need to maintain
                            centralized control.
                          </p>
                        </li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
              {wizardStep === IdentityWizardSteps.CreateIdentity && (
                <OrgIdentityModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
              )}
              {wizardStep === IdentityWizardSteps.LinkIdentity && (
                <OrgIdentityLinkForm onClose={() => handlePopUpClose("identity")} />
              )}
            </DialogContent>
          </Dialog>
          <ConfirmDeleteDialog
            isOpen={popUp.deleteIdentity.isOpen}
            name={(popUp?.deleteIdentity?.data as { name: string })?.name || "machine identity"}
            isPending={isDeletingIdentity}
            onOpenChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
            onConfirm={() =>
              onDeleteIdentitySubmit(
                (popUp?.deleteIdentity?.data as { identityId: string })?.identityId
              )
            }
          />
        </>
      )}
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={popUp.upgradePlan.data?.text}
        isEnterpriseFeature={popUp.upgradePlan.data?.isEnterpriseFeature}
      />
    </>
  );
};

export const IdentitySection = withPermission(() => <IdentitySectionContent />, {
  action: OrgPermissionIdentityActions.Read,
  subject: OrgPermissionSubjects.Identity
});

export const IdentityAuthTemplatesSection = () => <IdentitySectionContent view="templates" />;
