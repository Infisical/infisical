import { useEffect, useState } from "react"
import KeyPair from "~/components/dashboard/KeyPair"

interface KeyListProps {
  keyPairs: KeyPairType[]
  type: string
  searchKeys: string
}

interface KeyPairType {
  id: string
  pos: number
  key: string
  value: string
  type: string
}

/**
 * This component collects all the env variables as a list and manages all side effects related to keypairs e.g filter, etc.
 * @param {KeyPairType[]} keyPairs - list of all keypairs (env variables[]).
 * @param {string} type - the visibility of the Keypairs. Either private or shared
 * @param {string} searchKeys - filter string to search through the different keypairs (env variables)
*/

function KeyList({ keyPairs, type, searchKeys }: KeyListProps) {
  const [selectedKeys, setSelectedKeys] = useState(keyPairs)

  /**
   * filter/set keypairs depending on type and searchKey
   */
  useEffect(() => {
    const setInitialKeys = (data: KeyPairType[]) => {
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
      {selectedKeys.map((keyPair: KeyPairType) => (
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
