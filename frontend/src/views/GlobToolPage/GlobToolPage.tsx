import { GlobTestSection } from './components/GlobTestSection'

export const GlobToolPage = () => {
  return (
    <div className="min-h-screen w-full flex flex-col bg-bunker-800 text-white p-6">
      <p className="text-3xl font-semibold text-white">Secrets Glob Tool</p>
      <p className="mb-6 text-md text-bunker-300">
        Test your secret&apos;s path (globs) against sets of test strings quickly and easily.
      </p>

      <GlobTestSection />
    </div>
  )
}
