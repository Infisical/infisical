import { GlobTestSection } from './components/GlobTestSection'

export const GlobToolPage = () => {
  return (
    <div className="h-screen w-full flex flex-col bg-bunker-800 text-white p-6">
      <p className="mr-4 mb-4 text-3xl font-semibold text-white">Secrets (glob tool)</p>
      <p className="text-md text-bunker-300">
        Test your secrets path (globs) against sets of test strings quickly and easily
      </p>

      <GlobTestSection />
    </div>
  )
}
