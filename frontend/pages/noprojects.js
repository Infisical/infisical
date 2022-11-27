import React from "react";
import { faFolderOpen } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export default function NoProjects() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-gray-300 text-lg text-center w-11/12 mr-auto">
      <FontAwesomeIcon
        icon={faFolderOpen}
        className="text-7xl mb-8 w-full px-auto"
      />
      <div className="max-w-md">
        You are not part of any projects in this organization yet. When you do,
        they will appear here.
      </div>
      <div className="max-w-md mt-4">
        Create a new project, or ask other organization members to give you
        neccessary permissions.
      </div>
    </div>
  );
}

NoProjects.requireAuth = true;
