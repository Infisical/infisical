import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, Checkbox, PopoverContent } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

import { WsTag } from "../../hooks/api/tags/types";
import { ProjectPermissionCan } from "../permissions";

interface Props {
  wsTags: WsTag[] | undefined;
  secKey: string;
  selectedTagIds: Record<string, boolean>;
  handleSelectTag: (wsTag: WsTag) => void;
  handleTagOnMouseEnter: (wsTag: WsTag) => void;
  handleTagOnMouseLeave: () => void;
  checkIfTagIsVisible: (wsTag: WsTag) => boolean;
  handleOnCreateTagOpen: () => void;
}

const AddTagPopoverContent = ({
  wsTags,
  secKey,
  selectedTagIds,
  handleSelectTag,
  handleTagOnMouseEnter,
  handleTagOnMouseLeave,
  checkIfTagIsVisible,
  handleOnCreateTagOpen
}: Props) => {
  return (
    <PopoverContent
      side="left"
      className="relative max-h-96 w-auto min-w-[200px] overflow-y-auto overflow-x-hidden border border-mineshaft-600 bg-mineshaft-800 p-2 text-bunker-200"
      hideCloseBtn
    >
      <div className=" text-center text-sm font-medium text-bunker-200">
        Add tags to {secKey || "this secret"}
      </div>
      <div className="absolute left-0 mt-2 w-full border-t border-mineshaft-600" />
      <div className="flex flex-col space-y-1.5">
        {wsTags?.map((wsTag: WsTag) => (
          <div
            key={`tag-${wsTag.id}`}
            className="relative mt-4 flex h-[32px] items-center  justify-start rounded-md bg-none   p-2  hover:border hover:border-mineshaft-600  hover:bg-mineshaft-700 hover:text-bunker-200"
            onClick={() => handleSelectTag(wsTag)}
            onMouseEnter={() => handleTagOnMouseEnter(wsTag)}
            onMouseLeave={() => handleTagOnMouseLeave()}
            tabIndex={0}
            role="button"
            onKeyDown={() => {}}
          >
            {(checkIfTagIsVisible(wsTag) || selectedTagIds?.[wsTag.slug]) && (
              <Checkbox
                id="autoCapitalization"
                isChecked={selectedTagIds?.[wsTag.slug]}
                className="absolute top-[50%] left-[10px] translate-y-[-50%] "
                checkIndicatorBg={`${
                  !selectedTagIds?.[wsTag.slug] ? "text-transparent" : "text-mineshaft-800"
                }`}
              />
            )}
            <div className="ml-7 flex items-center gap-3">
              <div
                className="h-[10px] w-[10px] rounded-full"
                style={{ background: wsTag?.color ? wsTag.color : "#bec2c8" }}
              >
                {" "}
              </div>
              <span>{wsTag.slug}</span>
            </div>
          </div>
        ))}
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Tags}>
          {(isAllowed) => (
            <Button
              onClick={() => handleOnCreateTagOpen()}
              isDisabled={!isAllowed}
              size="xs"
              className="mt-2"
              leftIcon={<FontAwesomeIcon icon={faPlus} className="ml-1 mr-2" />}
            >
              Add new tag
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
    </PopoverContent>
  );
};

export default AddTagPopoverContent;
