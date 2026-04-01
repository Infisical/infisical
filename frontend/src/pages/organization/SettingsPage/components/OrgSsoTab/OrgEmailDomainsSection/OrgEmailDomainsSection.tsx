import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { OrgPermissionCan, PermissionDeniedBanner } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrgPermission,
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks";

import { AddEmailDomainModal } from "./AddEmailDomainModal";
import { OrgEmailDomainsTable } from "./OrgEmailDomainsTable";

export const OrgEmailDomainsSection = () => {
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "addDomain"
  ] as const);
  const { permission } = useOrgPermission();
  const { subscription } = useSubscription();

  const hasEmailDomainVerification = Boolean(subscription?.emailDomainVerification);

  return (
    <>
      <hr className="border-mineshaft-600" />
      <div className="pt-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xl font-medium text-gray-200">Email Domains</p>
            <p className="mt-1 text-sm text-gray-400">
              Verify ownership of your email domains to use with SSO and identity providers.
            </p>
          </div>
          {hasEmailDomainVerification && (
            <OrgPermissionCan
              I={OrgPermissionActions.Create}
              a={OrgPermissionSubjects.EmailDomains}
            >
              {(isAllowed) => (
                <Button
                  colorSchema="secondary"
                  isDisabled={!isAllowed}
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("addDomain")}
                >
                  Add domain
                </Button>
              )}
            </OrgPermissionCan>
          )}
        </div>
        {!hasEmailDomainVerification ? (
          <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6 text-center">
            <p className="text-gray-300">
              Your current plan does not include email domain verification.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Upgrade your plan to verify email domains for SSO and identity provider enforcement.
            </p>
          </div>
        ) : (
          <div>
            {permission.can(OrgPermissionActions.Read, OrgPermissionSubjects.EmailDomains) ? (
              <OrgEmailDomainsTable />
            ) : (
              <PermissionDeniedBanner />
            )}
          </div>
        )}
      </div>
      <AddEmailDomainModal
        popUp={popUp}
        handlePopUpClose={handlePopUpClose}
        handlePopUpToggle={handlePopUpToggle}
      />
    </>
  );
};
