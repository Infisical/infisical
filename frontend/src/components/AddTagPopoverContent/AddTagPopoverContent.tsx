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
      className="relative max-h-96 w-auto min-w-[200px] p-2 overflow-y-auto overflow-x-hidden border border-mineshaft-600 bg-mineshaft-800 text-bunker-200"
      hideCloseBtn
    >
      <div className=" text-center text-sm font-medium text-bunker-200">
        Add tags to {secKey || "this secret"}
      </div>
      <div className="absolute left-0 w-full border-mineshaft-600 border-t mt-2" />
      <div className="flex flex-col space-y-1.5">
        {wsTags?.map((wsTag: WsTag) => (
          <div
            key={`tag-${wsTag._id}`}
            className="mt-4 h-[32px] relative flex items-center  justify-start hover:border-mineshaft-600 hover:border   hover:bg-mineshaft-700  p-2 rounded-md  hover:text-bunker-200 bg-none"
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
                className="absolute top-[50%] translate-y-[-50%] left-[10px] "
                checkIndicatorBg={`${
                  !selectedTagIds?.[wsTag.slug] ? "text-transparent" : "text-mineshaft-800"
                }`}
              />
            )}
            <div className="ml-7 flex items-center gap-3">
              <div
                className="w-[10px] h-[10px] rounded-full"
                style={{ background: wsTag?.tagColor ? wsTag.tagColor : "#bec2c8" }}
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
