import { FC } from "react";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Input } from "@app/components/v2";

import { SearchProjectProps } from "../types";

const SearchProjects: FC<SearchProjectProps> = ({ onSearch, searchValue, placeholder = "" }) => {
  return (
    <Input
      value={searchValue}
      onChange={onSearch}
      leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
      placeholder={placeholder}
    />
  );
};

export default SearchProjects;
