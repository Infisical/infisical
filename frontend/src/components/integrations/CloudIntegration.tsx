import Image from "next/image";
import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import deleteIntegrationAuth from "../../pages/api/integrations/DeleteIntegrationAuth";

interface IntegrationOption {
  clientId: string;
  clientSlug?: string; // vercel-integration specific
  docsLink: string;
  image: string;
  isAvailable: boolean;
  name: string;
  slug: string;
  type: string;
}
interface IntegrationAuth {
  _id: string;
  integration: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  cloudIntegrationOption: IntegrationOption;
  setSelectedIntegrationOption: (cloudIntegration: IntegrationOption) => void;
  integrationOptionPress: (cloudIntegrationOption: IntegrationOption) => void;
  integrationAuths: IntegrationAuth[];
  handleDeleteIntegrationAuth: (args: { integrationAuth: IntegrationAuth }) => void;
}

const CloudIntegration = ({
  cloudIntegrationOption,
  setSelectedIntegrationOption,
  integrationOptionPress,
  integrationAuths,
  handleDeleteIntegrationAuth
}: Props) => {
  return integrationAuths ? (
    <div
      onKeyDown={() => null}
      role="button"
      tabIndex={0}
      className={`relative ${
        cloudIntegrationOption.isAvailable
          ? "cursor-pointer duration-200 hover:bg-mineshaft-700"
          : "opacity-50"
      } flex h-32 flex-row items-center rounded-md bg-mineshaft-800 border border-mineshaft-600 p-4`}
      onClick={() => {
        if (!cloudIntegrationOption.isAvailable) return;
        setSelectedIntegrationOption(cloudIntegrationOption);
        integrationOptionPress(cloudIntegrationOption);
      }}
      key={cloudIntegrationOption.name}
    >
      <Image
        src={`/images/integrations/${cloudIntegrationOption.image}`}
        height={70}
        width={70}
        alt="integration logo"
      />
      {cloudIntegrationOption.name.split(" ").length > 2 ? (
        <div className="ml-4 max-w-xs text-3xl font-semibold text-gray-300 duration-200 group-hover:text-gray-200">
          <div>{cloudIntegrationOption.name.split(" ")[0]}</div>
          <div className="text-base">
            {cloudIntegrationOption.name.split(" ")[1]} {cloudIntegrationOption.name.split(" ")[2]}
          </div>
        </div>
      ) : (
        <div className="ml-4 max-w-xs text-xl font-semibold text-gray-300 duration-200 group-hover:text-gray-200">
          {cloudIntegrationOption.name}
        </div>
      )}
      {cloudIntegrationOption.isAvailable &&
        integrationAuths
          .map((authorization) => authorization?.integration)
          .includes(cloudIntegrationOption.slug) && (
          <div className="group absolute top-0 right-0 z-40 flex flex-row">
            <div
              onKeyDown={() => null}
              role="button"
              tabIndex={0}
              onClick={async (event) => {
                event.stopPropagation();
                const deletedIntegrationAuth = await deleteIntegrationAuth({
                  integrationAuthId: integrationAuths
                    .filter(
                      (authorization) => authorization.integration === cloudIntegrationOption.slug
                    )
                    .map((authorization) => authorization._id)[0]
                });

                handleDeleteIntegrationAuth({
                  integrationAuth: deletedIntegrationAuth
                });
              }}
              className="flex w-max cursor-pointer flex-row items-center rounded-bl-md bg-red py-0.5 px-2 text-xs opacity-30 duration-200 group-hover:opacity-100"
            >
              <FontAwesomeIcon icon={faXmark} className="mr-2 text-xs" />
              Revoke
            </div>
            <div className="flex w-max flex-row items-center rounded-tr-md bg-primary py-0.5 px-2 text-xs text-black opacity-70 duration-200 group-hover:opacity-100">
              <FontAwesomeIcon icon={faCheck} className="mr-2 text-xs" />
              Authorized
            </div>
          </div>
        )}
      {!cloudIntegrationOption.isAvailable && (
        <div className="group absolute top-0 right-0 z-50 flex flex-row">
          <div className="flex w-max flex-row items-center rounded-bl-md rounded-tr-md bg-yellow py-0.5 px-2 text-xs text-black opacity-90">
            Coming Soon
          </div>
        </div>
      )}
    </div>
  ) : (
    <div />
  );
};

export default CloudIntegration;
