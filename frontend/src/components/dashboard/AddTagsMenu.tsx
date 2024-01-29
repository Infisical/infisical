import { Fragment } from "react";
import { useRouter } from "next/router";
import { faCheckSquare, faPlus, faSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Menu, Transition } from "@headlessui/react";
import { Tag } from "public/data/frequentInterfaces";

/**
 * This is the menu that is used to add more tags to a secret
 * @param {object} obj
 * @param {Tag[]} obj.allTags - all available tags for a vertain project
 * @param {Tag[]} obj.currentTags - currently selected tags for a certain secret
 * @param {function} obj.modifyTags - modify tags for a certain secret
 * @param {Tag[]} obj.position - currently selected tags for a certain secret
 */
const AddTagsMenu = ({
  allTags,
  currentTags,
  modifyTags,
  id
}: {
  allTags: Tag[];
  currentTags: Tag[];
  modifyTags: (value: Tag[], id: string) => void;
  id: string;
}) => {
  const router = useRouter();
  return (
    <Menu as="div" className="relative ml-2 inline-block text-left">
      <Menu.Button
        as="div"
        className="flex items-center justify-center font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-opacity-75"
      >
        <div className="flex cursor-pointer items-center rounded-sm bg-mineshaft/30 text-sm text-mineshaft-200/50 duration-200 hover:bg-mineshaft/70">
          <FontAwesomeIcon icon={faPlus} className="p-[0.28rem]" />
          {currentTags?.length > 2 && <span className="pr-2">{currentTags.length - 2}</span>}
        </div>
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 z-[90] mt-0.5 w-[12rem] origin-top-right space-y-1 rounded-md border border-mineshaft-500 bg-mineshaft-600 p-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 drop-shadow-xl focus:outline-none">
          {allTags?.map((tag) => {
            return (
              <Menu.Item key={tag.id}>
                <button
                  type="button"
                  className={`${
                    currentTags?.map((currentTag) => currentTag.name).includes(tag.name)
                      ? "cursor-default opacity-30"
                      : "hover:bg-mineshaft-700"
                  } flex w-full items-center rounded-sm bg-mineshaft-800 px-2 py-0.5 text-left text-bunker-200`}
                  onClick={() => {
                    if (!currentTags?.map((currentTag) => currentTag.name).includes(tag.name)) {
                      modifyTags(currentTags.concat([tag]), id);
                    }
                  }}
                >
                  {currentTags?.map((currentTag) => currentTag.name).includes(tag.name) ? (
                    <FontAwesomeIcon icon={faCheckSquare} className="mr-2 text-xs text-primary" />
                  ) : (
                    <FontAwesomeIcon icon={faSquare} className="mr-2 text-xs" />
                  )}{" "}
                  {tag.name}
                </button>
              </Menu.Item>
            );
          })}
          <button
            type="button"
            className="w-full rounded-sm bg-mineshaft-800 px-2 py-0.5 text-left text-bunker-200 duration-200 hover:bg-primary hover:text-black"
            onClick={() => router.push(`/project/${String(router.query.id)}/settings`)}
          >
            <FontAwesomeIcon icon={faPlus} className="mr-2 text-xs" />
            Add more tags
          </button>
        </Menu.Items>
      </Transition>
    </Menu>
  );
};

export default AddTagsMenu;
