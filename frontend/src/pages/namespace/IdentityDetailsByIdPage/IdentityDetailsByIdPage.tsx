import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { NamespacePermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Modal, ModalContent, PageHeader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  NamespacePermissionIdentityActions,
  NamespacePermissionSubjects,
  useNamespace
} from "@app/context";
import {
  namespaceIdentityQueryKeys,
  useDeleteNamespaceIdentity
} from "@app/hooks/api/namespaceIdentity";
import { usePopUp } from "@app/hooks/usePopUp";
import { IdentityAuthMethodModal } from "@app/pages/organization/AccessManagementPage/components/OrgIdentityTab/components/IdentitySection/IdentityAuthMethodModal";
import {
  IdentityAuthenticationSection,
  IdentityProjectsSection
} from "@app/pages/organization/IdentityDetailsByIDPage/components";
import { ViewIdentityAuthModal } from "@app/pages/organization/IdentityDetailsByIDPage/components/ViewIdentityAuthModal/ViewIdentityAuthModal";
import { OrgAccessControlTabSections } from "@app/types/org";

import { IdentityDetailsSection } from "./components/IdentityDetailsSection";
import { IdentityRoleDetailsSection } from "./components/IdentityRoleDetailsSection";
import { NamespaceIdentityForm } from "../AccessManagementPage/components/IdentityTab/components/NamespaceIdentityForm";

const Page = () => {
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.Namespace.IdentityDetailsByIdPage.id
  });
  const identityId = params.identityId as string;
  const { namespaceId } = useNamespace();
  const { data, isPending: isMembershipDetailsLoading } = useQuery(
    namespaceIdentityQueryKeys.detail({
      identityId,
      namespaceId
    })
  );
  const { mutateAsync: deleteIdentity } = useDeleteNamespaceIdentity();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "identity",
    "deleteIdentity",
    "identityAuthMethod",
    "upgradePlan",
    "viewAuthMethod"
  ] as const);

  const onDeleteIdentitySubmit = async (id: string) => {
    try {
      await deleteIdentity({
        identityId: id,
        namespaceId
      });

      createNotification({
        text: "Successfully deleted identity",
        type: "success"
      });

      handlePopUpClose("deleteIdentity");
      navigate({
        to: "/organization/namespaces/$namespaceId/access-management",
        params: {
          namespaceId
        },
        search: {
          selectedTab: OrgAccessControlTabSections.Identities
        }
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text =
        typeof error?.response?.data?.message === "string"
          ? error?.response?.data?.message
          : "Failed to delete identity";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader scope="namespace" title={data.identity.name} />
          <div className="flex">
            <div className="mr-4 w-96">
              <IdentityDetailsSection identityId={identityId} handlePopUpOpen={handlePopUpOpen} />
              <IdentityAuthenticationSection
                identity={data.identity}
                handlePopUpOpen={handlePopUpOpen}
              />
            </div>
            <div className="flex-1">
              <IdentityRoleDetailsSection
                identityMembershipDetails={data}
                isMembershipDetailsLoading={isMembershipDetailsLoading}
              />
              <IdentityProjectsSection identityId={identityId} />
            </div>
          </div>
        </div>
      )}
      <Modal
        isOpen={popUp?.identity?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("identity", isOpen);
        }}
      >
        <ModalContent title="Edit Identity " bodyClassName="overflow-visible">
          <NamespaceIdentityForm
            handlePopUpToggle={() => handlePopUpToggle("identity")}
            identityId={identityId}
          />
        </ModalContent>
      </Modal>
      <IdentityAuthMethodModal
        popUp={popUp}
        handlePopUpOpen={handlePopUpOpen}
        handlePopUpToggle={handlePopUpToggle}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text={(popUp.upgradePlan?.data as { description: string })?.description}
      />
      <DeleteActionModal
        isOpen={popUp.deleteIdentity.isOpen}
        title={`Are you sure you want to delete ${
          (popUp?.deleteIdentity?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onDeleteIdentitySubmit(
            (popUp?.deleteIdentity?.data as { identityId: string })?.identityId
          )
        }
      />
      <ViewIdentityAuthModal
        isOpen={popUp.viewAuthMethod.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("viewAuthMethod", isOpen)}
        authMethod={popUp.viewAuthMethod.data?.authMethod}
        lockedOut={popUp.viewAuthMethod.data?.lockedOut || false}
        identityId={identityId}
        onResetAllLockouts={popUp.viewAuthMethod.data?.refetchIdentity}
      />
    </div>
  );
};

export const IdentityDetailsByIdPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <NamespacePermissionCan
        passThrough={false}
        I={NamespacePermissionIdentityActions.Read}
        a={NamespacePermissionSubjects.Identity}
      >
        <Page />
      </NamespacePermissionCan>
    </>
  );
};
