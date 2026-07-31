import { faArrowUpRightFromSquare, faWarning, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton } from "@app/components/v2";
import { useOrganization, useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import { useBannerDismissal } from "@app/hooks";
import { useGetNativeIntegrationDeprecationStatus } from "@app/hooks/api";

const DISMISS_STORAGE_KEY = "native-integrations-banner-dismissed-at";
const SECRET_SYNCS_DOCS_URL = "https://infisical.com/docs/integrations/secret-syncs/overview";

export const NativeIntegrationsBanner = () => {
  const { currentOrg } = useOrganization();
  const [isDismissed, dismiss] = useBannerDismissal(DISMISS_STORAGE_KEY);
  const { hasOrgRole } = useOrgPermission();
  const isOrgAdmin = hasOrgRole(OrgMembershipRole.Admin);

  const { data } = useGetNativeIntegrationDeprecationStatus(currentOrg.id, {
    enabled: isOrgAdmin
  });

  if (isDismissed || !data?.hasNativeIntegrations) return null;

  return (
    <div className="flex w-full items-center border-b border-yellow/50 bg-yellow/30 px-4 py-2 text-sm text-yellow-200">
      <FontAwesomeIcon icon={faWarning} className="mr-2.5 text-base text-yellow" />
      You have projects with native integrations. Native integrations are being deprecated, recreate
      them as Secret Syncs.
      <a
        href={SECRET_SYNCS_DOCS_URL}
        rel="noopener noreferrer"
        target="_blank"
        className="group flex items-center"
      >
        <span className="cursor-pointer pl-1 underline underline-offset-2 duration-100 group-hover:text-mineshaft-100 group-hover:decoration-mineshaft-100">
          Learn more
        </span>
        <FontAwesomeIcon
          className="mt-[0.12rem] ml-1 group-hover:text-mineshaft-100"
          icon={faArrowUpRightFromSquare}
          size="xs"
        />
      </a>
      <IconButton
        className="ml-auto shrink-0 p-0 text-yellow-200"
        ariaLabel="Dismiss banner"
        variant="plain"
        onClick={dismiss}
      >
        <FontAwesomeIcon icon={faXmark} />
      </IconButton>
    </div>
  );
};
