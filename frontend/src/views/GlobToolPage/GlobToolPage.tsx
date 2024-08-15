import { GlobTestSection } from './components/GlobTestSection'

export const GlobToolPage = () => {
  return (
    <div className="flex h-screen flex-col overflow-y-auto bg-gradient-to-tr from-mineshaft-700 to-bunker-800 text-gray-200 dark:[color-scheme:dark]">
      <GlobTestSection />
    </div>
  )
}
