import React from "react";
import Integration from "./Integration";
import guidGenerator from "~/utilities/randomId";

interface Props {
    projectIntegrations: any
}

const ProjectIntegrationSection = ({
    projectIntegrations
}: Props) => {
    return (
        <>
        <div className="flex flex-col justify-between items-start mx-4 mb-4 mt-6 text-xl max-w-5xl px-2">
          <h1 className="font-semibold text-3xl">Current Project Integrations</h1>
          <p className="text-base text-gray-400">
            Manage your integrations of Infisical with third-party services.
          </p>
        </div>
        {projectIntegrations.map((projectIntegration) => (
          <Integration
            key={guidGenerator()}
            projectIntegration={projectIntegration}
          />
        ))}
      </>
    );
}

export default ProjectIntegrationSection;