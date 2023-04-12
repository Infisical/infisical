export const EnvComparisonHeader = ({ userAvailableEnvs }: { userAvailableEnvs?: any[] }): JSX.Element => (
  <thead>
    <tr className="absolute flex flex-row sticky top-0 h-12">
      <td className="w-10 px-4 flex items-center justify-center border-none">
        <div className='text-center w-10 text-xs text-transparent'>{0}</div>
      </td>
      <td className="border-none">
        <div className="min-w-[220px] lg:min-w-[240px] xl:min-w-[280px] relative flex items-center justify-end w-full">
          <div className="text-sm font-medium text-transparent ">Secret</div>
        </div>
      </td>
      {userAvailableEnvs?.map(env => {
        return <>
          <td className="w-10 px-4 flex items-center justify-center border-none">
            <div className='text-center w-10 text-xs text-transparent'>{0}</div>
          </td>
          <th className="flex flex-row w-full bg-mineshaft-800 border border-mineshaft-600 rounded-t-md items-center"><div className="text-md font-medium w-full text-center">{env.name}</div></th>
      </>
      })}
    </tr>
  </thead>
);
