import React from "react";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCheck,
    faX,
  } from "@fortawesome/free-solid-svg-icons";
import deleteIntegrationAuth from "../../pages/api/integrations/DeleteIntegrationAuth";

interface CloudIntegrationOption {
    name: string;
    type: string;
    clientId: string;
    docsLink: string;
}

interface Props {
    cloudIntegrationOption: CloudIntegrationOption;
    setSelectedIntegrationOption: () => void;
    integrationOptionPress: () => void;
    integrationAuths: any;
}

const CloudIntegration = ({
    cloudIntegrationOption,
    setSelectedIntegrationOption,
    integrationOptionPress,
    integrationAuths
}: Props) => {
    return integrationAuths ? (
        <div
        className={`relative ${
            ["Heroku"].includes(cloudIntegrationOption.name)
            ? "hover:bg-white/10 duration-200 cursor-pointer"
            : "opacity-50"
        } flex flex-row bg-white/5 h-32 rounded-md p-4 items-center`}
        onClick={() => {
            if (!["Heroku"].includes(cloudIntegrationOption.name)) return;
            setSelectedIntegrationOption(cloudIntegrationOption);
            integrationOptionPress({
                integrationOption: cloudIntegrationOption
            });
        }}
        key={cloudIntegrationOption.name}
        >
            <Image
            src={`/images/integrations/${cloudIntegrationOption.name}.png`}
            height={70}
            width={70}
            alt="integration logo"
            />
            {cloudIntegrationOption.name.split(" ").length > 2 ? (
            <div className="font-semibold text-gray-300 group-hover:text-gray-200 duration-200 text-3xl ml-4 max-w-xs">
                <div>{cloudIntegrationOption.name.split(" ")[0]}</div>
                <div className="text-base">
                {cloudIntegrationOption.name.split(" ")[1]}{" "}
                {cloudIntegrationOption.name.split(" ")[2]}
                </div>
            </div>
            ) : (
            <div className="font-semibold text-gray-300 group-hover:text-gray-200 duration-200 text-xl ml-4 max-w-xs">
                {cloudIntegrationOption.name}
            </div>
            )}
        {["Heroku"].includes(cloudIntegrationOption.name) &&
            integrationAuths
            .map((authorization) => authorization.integration)
            .includes(cloudIntegrationOption.name.toLowerCase()) && (
            <div className="absolute group z-50 top-0 right-0 flex flex-row">
                <div
                onClick={() => {
                    deleteIntegrationAuth({
                    integrationAuthId: integrationAuths
                        .filter(
                        (authorization) =>
                            authorization.integration ==
                            cloudIntegrationOption.name.toLowerCase()
                        )
                        .map((authorization) => authorization._id)[0],
                    });
                    router.reload();
                }}
                className="cursor-pointer w-max bg-red py-0.5 px-2 rounded-b-md text-xs flex flex-row items-center opacity-0 group-hover:opacity-100 duration-200"
                >
                <FontAwesomeIcon
                    icon={faX}
                    className="text-xs mr-2 py-px"
                />
                Revoke
                </div>
                <div className="w-max bg-primary py-0.5 px-2 rounded-bl-md rounded-tr-md text-xs flex flex-row items-center text-black opacity-90 group-hover:opacity-100 duration-200">
                <FontAwesomeIcon
                    icon={faCheck}
                    className="text-xs mr-2"
                />
                Authorized
                </div>
            </div>
            )}
        {!["Heroku"].includes(cloudIntegrationOption.name) && (
            <div className="absolute group z-50 top-0 right-0 flex flex-row">
            <div className="w-max bg-yellow py-0.5 px-2 rounded-bl-md rounded-tr-md text-xs flex flex-row items-center text-black opacity-90">
                Coming Soon
            </div>
            </div>
        )}
        </div>
    ) : <div></div>
} 

export default CloudIntegration;