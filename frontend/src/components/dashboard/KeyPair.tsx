import { faEllipsis, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SecretDataProps, Tag } from "public/data/frequentInterfaces";

import AddTagsMenu from "./AddTagsMenu";
import DashboardInputField from "./DashboardInputField";
import { DeleteActionButton } from "./DeleteActionButton";

interface KeyPairProps {
  keyPair: SecretDataProps;
  modifyKey: (value: string, id: string) => void;
  modifyValue: (value: string, id: string) => void;
  modifyValueOverride: (value: string | undefined, id: string) => void;
  modifyComment: (value: string, id: string) => void;
  modifyTags: (value: Tag[], id: string) => void;
  isBlurred: boolean;
  isDuplicate: boolean;
  toggleSidebar: (id: string) => void;
  sidebarSecretId: string;
  isSnapshot: boolean;
  isCapitalized: boolean;
  deleteRow?: (props: DeleteRowFunctionProps) => void;
  tags: Tag[];
  togglePITSidebar?: (value: boolean) => void;
}

export interface DeleteRowFunctionProps {
  ids: string[];
  secretName: string;
}

const colors = [
  "bg-[#f1c40f]/40",
  "bg-[#cb1c8d]/40",
  "bg-[#badc58]/40",
  "bg-[#ff5400]/40",
  "bg-[#3AB0FF]/40",
  "bg-[#6F1AB6]/40",
  "bg-[#C40B13]/40",
  "bg-[#332FD0]/40"
]


const colorsText = [
  "text-[#fcf0c3]/70",
  "text-[#f2c6e3]/70",
  "text-[#eef6d5]/70",
  "text-[#ffddcc]/70",
  "text-[#f0fffd]/70",
  "text-[#FFE5F1]/70",
  "text-[#FFDEDE]/70",
  "text-[#DFF6FF]/70"
]

/**
 * This component represent a single row for an environemnt variable on the dashboard
 * @param {object} obj
 * @param {SecretDataProps[]} obj.keyPair - data related to the environment variable (id, pos, key, value, public/private)
 * @param {function} obj.modifyKey - modify the key of a certain environment variable
 * @param {function} obj.modifyValue - modify the value of a certain environment variable
 * @param {function} obj.modifyValueOverride - modify the value of a certain environment variable if it is overriden
 * @param {function} obj.modifyComment - modify the comment of a certain environment variable
 * @param {function} obj.modifyTags - modify the tags of a certain environment variable
 * @param {boolean} obj.isBlurred - if the blurring setting is turned on
 * @param {boolean} obj.isDuplicate - list of all the duplicates secret names on the dashboard
 * @param {function} obj.toggleSidebar - open/close/switch sidebar
 * @param {string} obj.sidebarSecretId - the id of a secret for the side bar is displayed
 * @param {boolean} obj.isSnapshot - whether this keyPair is in a snapshot. If so, it won't have some features like sidebar
 * @param {function} obj.deleteRow - a function to delete a certain keyPair
 * @param {function} obj.togglePITSidebar - open or close the Point-in-time recovery sidebar
 * @param {Tag[]} obj.tags - tags for a certain secret
 * @returns
 */
const KeyPair = ({
  keyPair,
  modifyKey,
  modifyValue,
  modifyValueOverride,
  modifyComment,
  modifyTags,
  isBlurred,
  isDuplicate,
  toggleSidebar,
  sidebarSecretId,
  isCapitalized,
  isSnapshot, 
  deleteRow,
  togglePITSidebar,
  tags
}: KeyPairProps) => {
  const tagData = (tags.map((tag, index) => {return {
    ...tag, 
    color: colors[index%colors.length], 
    colorText: colorsText[index%colorsText.length]
  }}));

  return (
  <div
    className={`group flex flex-col items-center border-b border-mineshaft-500 hover:bg-white/[0.03] duration-100 ${isSnapshot && "pointer-events-none"} ${
      keyPair.id === sidebarSecretId && "bg-mineshaft-700 duration-200"
    }`}
  >
    <div className="relative flex flex-row justify-between w-full mr-auto max-h-14 items-center">
      <div className="w-[23%] border-r border-mineshaft-600 flex flex-row items-center">
        <div className='text-bunker-400 text-xs flex items-center justify-center w-14 h-10 cursor-default'>{keyPair.pos + 1}</div>
        <div className="flex items-center max-h-16 w-full">
          <DashboardInputField
            isCapitalized = {isCapitalized}
            onChangeHandler={modifyKey}
            type="varName"
            id={keyPair.id ? keyPair.id : (keyPair.idOverride || "")}
            value={keyPair.key}
            isDuplicate={isDuplicate}
            overrideEnabled={keyPair.valueOverride !== undefined}
            modifyValueOverride={modifyValueOverride}
            isSideBarOpen={keyPair.id === sidebarSecretId}
          />
        </div>
      </div>
      <div className="w-5/12 border-r border-mineshaft-600">
        <div
          className='flex items-center rounded-lg mt-4 md:mt-0 max-h-10'
        >
          <DashboardInputField
            onChangeHandler={keyPair.valueOverride !== undefined ? modifyValueOverride : modifyValue}
            type="value"
            id={keyPair.id ? keyPair.id : (keyPair.idOverride || "")}
            value={keyPair.valueOverride !== undefined ? keyPair.valueOverride : keyPair.value}
            blurred={isBlurred}
            overrideEnabled={keyPair.valueOverride !== undefined}
            isSideBarOpen={keyPair.id === sidebarSecretId}
          />
        </div>
      </div>
      <div className="w-[calc(10%)] border-r border-mineshaft-600">
        <div className="flex items-center max-h-16">
          <DashboardInputField
            onChangeHandler={modifyComment}
            type="comment"
            id={keyPair.id ? keyPair.id : (keyPair.idOverride || "")}
            value={keyPair.comment}
            isDuplicate={isDuplicate}
            isSideBarOpen={keyPair.id === sidebarSecretId}
          />
        </div>
      </div>
      <div className="w-2/12 h-10 flex items-center overflow-visible overflow-r-scroll no-scrollbar no-scrollbar::-webkit-scrollbar">
        <div className="flex items-center max-h-16">
          {keyPair.tags?.map((tag, index) => (
            index < 2 && <div key={keyPair.pos} className={`ml-2 px-1.5 ${tagData.filter(tagDp => tagDp._id === tag._id)[0]?.color} rounded-sm text-sm ${tagData.filter(tagDp => tagDp._id === tag._id)[0]?.colorText} flex items-center`}>
              <span className='mb-0.5 cursor-default'>{tag.name}</span>
              <FontAwesomeIcon icon={faXmark} className="ml-1 cursor-pointer p-1" onClick={() => modifyTags(keyPair.tags.filter(ttag => ttag._id !== tag._id), keyPair.id)}/>
            </div>
          ))}
          
          <AddTagsMenu allTags={tags} currentTags={keyPair.tags} modifyTags={modifyTags} id={keyPair.id ? keyPair.id : (keyPair.idOverride || "")} />
        </div>
      </div>
      <div
        onKeyDown={() => null}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (togglePITSidebar) {
            togglePITSidebar(false);
          }
          toggleSidebar(keyPair.id)
        }}
        className={`cursor-pointer w-[1.5rem] h-[2.35rem] ml-auto group-hover:bg-mineshaft-700 z-50 rounded-md invisible group-hover:visible flex flex-row justify-center items-center ${isSnapshot ?? "invisible"}`}
      >
        <FontAwesomeIcon className="text-bunker-300 hover:text-primary text-lg" icon={faEllipsis} />
      </div>
      <div className={`group-hover:bg-mineshaft-700 z-50 ${isSnapshot ?? "invisible"}`}>
        {keyPair.key || keyPair.value 
        ? <DeleteActionButton
          onSubmit={() => { if (deleteRow) {
            deleteRow({ ids: [keyPair.id], secretName: keyPair?.key })
          }}}
          isPlain
        />
      :  <div className='cursor-pointer w-[1.5rem] h-[2.35rem] mr-2 flex items-center justfy-center'>
        <div
          onKeyDown={() => null}
          role="button"
          tabIndex={0}
          onClick={() => { if (deleteRow) {
            deleteRow({ ids: [keyPair.id], secretName: keyPair?.key })
          }}}
          className="invisible group-hover:visible"
        >
          <FontAwesomeIcon className="text-bunker-300 hover:text-red pl-2 pr-6 text-lg mt-0.5" icon={faXmark} />
        </div>
      </div>}
      </div>
    </div>
  </div>
)};

export default KeyPair;
