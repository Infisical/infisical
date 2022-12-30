import { useEffect, useState } from "react"
import KeyPair from "~/components/dashboard/KeyPair"

function KeyList({ keyPairs, type, searchKeys }) {
  const [selectedKeys, setSelectedKeys] = useState(keyPairs)

  /**
   * filter/set keypairs depending on type and searchKey
   */
  useEffect(() => {
    const setInitialKeys = (data) => {
      const keys = data.filter(
        (keyPair) =>
          keyPair.key.toLowerCase().includes(searchKeys.toLowerCase()) &&
          keyPair.type == type
      )

      setSelectedKeys(keys)
    }

    setInitialKeys(keyPairs)
  }, [keyPairs, searchKeys])

  return (
    <div>
      {selectedKeys.map((keyPair) => (
        <KeyPair
          key={keyPair.id}
          keyPair={keyPair}
          duplicates={keyPairs
            ?.map((item) => item.key)
            .filter(
              (item, index) =>
                index !== keyPairs?.map((item) => item.key).indexOf(item)
            )}
        />
      ))}
    </div>
  )
}

export default KeyList
