import React from "react";
import Image from "next/image";

interface Framework {
  name: string;
  link: string;
  image: string;
}

const FrameworkIntegration = ({
  framework
}: {
  framework: Framework;
}) => {
  return (
    <div key={framework.name}>
      <a
        href={framework.link}
        rel="noopener"
        className={`relative flex flex-row items-center justify-center bg-bunker-500 hover:bg-gradient-to-tr hover:from-sky-400 hover:to-primary duration-200 h-32 rounded-md p-0.5 items-center cursor-pointer`}
      >
        <div className={`font-semibold bg-bunker-500 flex flex-col items-center justify-center h-full w-full rounded-md text-gray-300 group-hover:text-gray-200 duration-200 ${framework?.name?.split(" ").length > 1 ? "text-sm px-1" : "text-xl px-2"} text-center w-full max-w-xs`}>
          {framework?.image && <Image
            src={`/images/integrations/${framework.image}.png`}
            height={framework?.name ? 60 : 90}
            width={framework?.name ? 60 : 90}
            alt="integration logo"
          ></Image>}
          {framework?.name && framework?.image && <div className="h-2"></div>}
          {framework?.name && framework.name}
        </div>
      </a>
    </div>
  );
}

export default FrameworkIntegration;
