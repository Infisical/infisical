import React from "react";
import Image from "next/image";
import { faFolderOpen } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function NoProjects() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-300 text-lg text-center w-11/12 mr-auto">
      <div
        className="mb-4 mr-16"
      >
        <Image
          src="/images/dragon-cant-find.png"
          height={270}
          width={436}
          alt="google logo"
        ></Image>
      </div>
      <div className="p-4 rounded-md bg-bunker-500 mb-8 text-bunker-300 shadow-xl">
        <div className="max-w-md">
          You are not part of any projects in this organization yet. When you do,
          they will appear here.
        </div>
        <div className="max-w-md mt-4">
          Create a new project, or ask other organization members to give you
          neccessary permissions.
        </div>
      </div>
    </div>
  );
}

NoProjects.requireAuth = true;
