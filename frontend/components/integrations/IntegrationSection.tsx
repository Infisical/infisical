import React from "react";
import Integration from "./Integration";
import guidGenerator from "~/utilities/randomId";

interface Integration {

}

interface Props {
  integrations: any
}

const ProjectIntegrationSection = ({
  integrations
}: Props) => {
    return integrations.length > 0 ? (
      <div className="mb-12">
        <div className="flex flex-col justify-between items-start mx-4 mb-4 mt-6 text-xl max-w-5xl px-2">
          <h1 className="font-semibold text-3xl">Current Project Integrations</h1>
          <p className="text-base text-gray-400">
            Manage your integrations of Infisical with third-party services.
          </p>
        </div>
        {integrations.map((integration  => ( 
          <Integration
            key={guidGenerator()}
            integration={integration}
          />
        )))}
      </div>
    ) : <div></div>
}

export default ProjectIntegrationSection;