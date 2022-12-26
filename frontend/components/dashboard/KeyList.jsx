import { useEffect, useState } from "react"
import KeyPair from "~/components/dashboard/KeyPair"

function KeyList({
  keyPairs,
  type,
  searchKeys,
  modifyValue,
  modifyKey,
  isBlurred,
  deleteCertainRow,
  modifyVisibility,
  toggleSidebar,
  sidebarSecretNumber,
}) {
  const [initialKeys] = useState(keyPairs)
  const [selectedKeys, setSelectedKeys] = useState(initialKeys)

  useEffect(() => {
    const setSharedKeys = (data) => {
      const sharedKeys = data.filter(
        (keyPair) =>
          keyPair.key.toLowerCase().includes(searchKeys.toLowerCase()) &&
          keyPair.type == "shared"
      )
  
      setSelectedKeys(sharedKeys)
    }
  
    const setPersonalKeys = (data) => {
      const personalKeys = data.filter(
        (keyPair) =>
          keyPair.key.toLowerCase().includes(searchKeys.toLowerCase()) &&
          keyPair.type == "personal"
      )
  
      setSelectedKeys(personalKeys)
    }

    if (type === "shared") {
      setSharedKeys(keyPairs)
    } else if (type === "personal") {
      setPersonalKeys(keyPairs)
    }
  }, [keyPairs, searchKeys])

  return (
    <div>
      {selectedKeys.map((keyPair) => (
        <KeyPair
          key={keyPair.id}
          keyPair={keyPair}
          deleteRow={deleteCertainRow}
          modifyValue={modifyValue}
          modifyKey={modifyKey}
          modifyVisibility={modifyVisibility}
          isBlurred={isBlurred}
          duplicates={keyPairs
            ?.map((item) => item.key)
            .filter(
              (item, index) =>
                index !== keyPairs?.map((item) => item.key).indexOf(item)
            )}
          toggleSidebar={toggleSidebar}
          sidebarSecretNumber={sidebarSecretNumber}
        />
      ))}
    </div>
  )
}

export default KeyList
