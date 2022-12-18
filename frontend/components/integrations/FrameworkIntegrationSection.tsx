import React from "react";
import FrameworkIntegration from "./FrameworkIntegration";

interface Framework {
    name: string;
    image: string;
    link: string;
}

interface Props {
    framework: Framework
}

const FrameworkIntegrationSection = ({ frameworks }: Props) => {
    return (
      <>
        <div className="flex flex-col justify-between items-start mx-4 mt-12 mb-4 text-xl max-w-5xl px-2">
          <h1 className="font-semibold text-3xl">Framework Integrations</h1>
          <p className="text-base text-gray-400">
            Click on a framework to get the setup instructions.
          </p>
        </div>
        <div className="grid gap-4 grid-cols-7 grid-rows-2 mx-6 mt-4 max-w-5xl">
          {frameworks.map((framework) => (
            <FrameworkIntegration 
              framework={framework}
              key={`framework-integration-${framework.slug}`}
            />
          ))}
        </div>
      </>
    );
}

export default FrameworkIntegrationSection;

