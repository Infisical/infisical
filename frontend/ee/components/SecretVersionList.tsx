import { useState } from 'react';
import { faCircle, faDotCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface SecretVersionListProps {}

const versionData = [{
  value: "Value1",
  date: "Date1",
  user: "vlad@infisical.com"
}, {
  value: "Value2",
  date: "Date2",
  user: "tony@infisical.com"
}]

/**
 * @returns a list of the versions for a specific secret
 */
const SecretVersionList = () => {
  return <div className='w-full h-52 px-4 mt-4 text-sm text-bunker-300 overflow-x-none'>
  <p className=''>Version History</p>
  <div className='p-1 rounded-md bg-bunker-800 border border-mineshaft-500 overflow-x-none'>
    <div className='h-48 overflow-y-scroll overflow-x-none'>
      {versionData.map((version, index) =>
        <div key={index} className='flex flex-row'>
          <div className='pr-1 flex flex-col items-center'>
            <div className='p-1'><FontAwesomeIcon icon={index == 0 ? faDotCircle : faCircle} /></div>
            <div className='w-0 h-full border-l mt-1'></div>
          </div>
          <div className='flex flex-col w-full max-w-[calc(100%-2.3rem)]'>
            <div className='pr-2 pt-1'>{version.date}</div>
            <div className=''><p className='break-words'><span className='py-0.5 px-1 rounded-md bg-primary-200/10 mr-1.5'>Value:</span>{version.value}</p></div>
            <div className=''><p className='break-words'><span className='py-0.5 px-1 rounded-md bg-primary-200/10 mr-1.5'>Updated by:</span>{version.user}</p></div>
          </div>
        </div>
      )}
    </div>
  </div>
</div>
};

export default SecretVersionList;
