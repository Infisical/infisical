import { useMemo } from "react";

import { CheckboxKeys, CheckedProjectsMap } from "../types";

type Props = {
  checkedProjects: CheckedProjectsMap;
};

const NumOfCheckedProjects = ({ checkedProjects }: Props) => {
  const numOfCheckedProjects = useMemo(() => {
    return Object.keys(checkedProjects).reduce((acc, currKey) => {
      if (checkedProjects[currKey] && currKey !== CheckboxKeys.ALL) {
        return acc + 1;
      }
      return acc;
    }, 0);
  }, [checkedProjects]);

  return (
    <div className="pt-4 text-sm font-normal text-gray-400">
      # of checked projects: {numOfCheckedProjects}
    </div>
  );
};

export default NumOfCheckedProjects;
