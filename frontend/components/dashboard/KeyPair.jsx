import DashboardInputField from "~/components/dashboard/DashboardInputField"
import Button from "~/components/basic/buttons/Button"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faEllipsis, faX } from "@fortawesome/free-solid-svg-icons"
import { useContext } from "react"
import { KeypairContext } from "../../pages/dashboard/[id]"

/**
 * This component represent a single row for an environemnt variable on the dashboard
 * @param {String[]} obj.keyPair - data related to the environment variable (id, pos, key, value, public/private)
 * @param {string[]} obj.duplicates - list of all the duplicates secret names on the dashboard
 * @returns
 */

const KeyPair = ({ keyPair, duplicates }) => {
  const {
    listenChangeValue,
    listenChangeKey,
    blurred,
    deleteRow,
    toggleSidebar,
    sidebarSecretNumber,
  } = useContext(KeypairContext)

  return (
    <div
      className={`mx-1 flex flex-col items-center ml-1 ${
        keyPair.pos == sidebarSecretNumber && "bg-mineshaft-500 duration-200"
      } rounded-md`}
    >
      <div className="relative flex flex-row justify-between w-full max-w-5xl mr-auto max-h-14 my-1 items-start px-1">
        <div className="min-w-xl w-96">
          <div className="flex pr-1 items-center rounded-lg mt-4 md:mt-0 max-h-16">
            <DashboardInputField
              onChangeHandler={listenChangeKey}
              type="varName"
              position={keyPair.pos}
              value={keyPair.key}
              duplicates={duplicates}
            />
          </div>
        </div>
        <div className="w-full min-w-5xl">
          <div className="flex min-w-7xl items-center pl-1 pr-1.5 rounded-lg mt-4 md:mt-0 max-h-10 ">
            <DashboardInputField
              onChangeHandler={listenChangeValue}
              type="value"
              position={keyPair.pos}
              value={keyPair.value}
              blurred={blurred}
            />
          </div>
        </div>
        <div
          onClick={() => toggleSidebar(keyPair.pos)}
          className="cursor-pointer w-9 h-9 bg-mineshaft-700 hover:bg-chicago-700 rounded-md flex flex-row justify-center items-center duration-200"
        >
          <FontAwesomeIcon
            className="text-gray-300 px-2.5 text-lg mt-0.5"
            icon={faEllipsis}
          />
        </div>
        <div className="w-2"></div>
        <div className="bg-[#9B3535] hover:bg-red rounded-md duration-200">
          <Button
            onButtonPressed={() => deleteRow(keyPair.id)}
            color="none"
            size="icon-sm"
            icon={faX}
          />
        </div>
      </div>
    </div>
  )
}

export default KeyPair
