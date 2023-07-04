import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router"

import createNewIntegrationSession from "../api/secret-scanning/createSecretScanningSession";
import getInstallationStatus from "../api/secret-scanning/getInstallationStatus";
import getRisksByOrganization, { GitRisks } from "../api/secret-scanning/getRisksByOrganization";
import linkGitAppInstallationWithOrganization from "../api/secret-scanning/linkGitAppInstallationWithOrganization";
import { RiskStatus } from "../api/secret-scanning/updateRiskStatus";

export default function SecretScanning() {
  const router = useRouter()
  const { state, installationId} = router.query
  const [integrationEnabled, setIntegrationStatus] = useState(false)
  const [gitRisks, setGitRisks] = useState<GitRisks[]>([]);
  const [selectedRiskStatus, setSelectedRiskStatus] = useState("");

  const handleSelectRiskStatusUpdate = (event: any) => {
    setSelectedRiskStatus(event.target.value);
  };

  console.log("selectedRiskStatus===>", selectedRiskStatus)

  useEffect(()=>{
    const fetchRisks = async () =>{
      const risks = await getRisksByOrganization(String(localStorage.getItem("orgData.id")))
      setGitRisks(risks)
    }

    const linkInstallation = async () => {
      if (typeof state === "string" && typeof installationId === "string"){
        try {
          await linkGitAppInstallationWithOrganization(installationId as string, state as string)
          console.log("installation verification complete")
        }catch (e){
          console.log("app installation is stale, start new session", e)
        }
      }
    }

    const fetchInstallationStatus = async () => {
      const status = await getInstallationStatus(String(localStorage.getItem("orgData.id")))
      setIntegrationStatus(status)
    }

    fetchInstallationStatus()
    linkInstallation()
    fetchRisks()
  },[state, installationId])

  const generateNewIntegrationSession = async () => {
    const session = await createNewIntegrationSession(String(localStorage.getItem("orgData.id")))
    router.push(`https://github.com/apps/infisical-radar/installations/new?state=${session.sessionId}`)
  }

  return (
    <div>
      <Head>
        <title>Secret scanning</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      {/* <NavHeader pageName={"Secret scanning"} isProjectRelated={false} /> */}
      
      <div className="text-left">
        {integrationEnabled ? (
          <b className="text-green-500">Git app is linked to this organization</b>
        ) : (
          <button
            type="button"
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            onClick={generateNewIntegrationSession}
          >
            Integrate with GitHub
          </button>
        )}
      </div>

      <table className="min-w-full divide-y divide-gray-200">
  <thead>
    <tr>
      <th className="py-3 px-6 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
        Date
      </th>
      <th className="py-3 px-6 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
        Secret Type
      </th>
      <th className="py-3 px-6 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
        View Risk
      </th>
      <th className="py-3 px-6 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
        Info
      </th>
      <th className="py-3 px-6 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
        Status
      </th>
      <th className="py-3 px-6 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
        Action
      </th>
    </tr>
  </thead>
  <tbody className="bg-white divide-y divide-gray-200">
      {gitRisks.map((risk) => {
        return (
          <tr key={risk.ruleID}>
            <td className="py-4 px-6 whitespace-nowrap">{risk.createdAt}</td>
            <td className="py-4 px-6 whitespace-nowrap">{risk.ruleID}</td>
            <td className="py-4 px-6 whitespace-nowrap">
              <a
                href={`https://github.com/${risk.repositoryFullName}/blob/${risk.commit}/${risk.file}#L${risk.startLine}-L${risk.endLine}`}
                target="_blank"
                className="text-red-500" rel="noreferrer"
              >
                View Exposed Secret
              </a>
            </td>
            <td className="py-4 px-6 whitespace-nowrap">
              <div className="font-bold">
                <a href={`https://github.com/${risk.repositoryFullName}`}>
                  {risk.repositoryFullName}
                </a>
              </div>
              <div className="text-xs">
                <span>{risk.file}</span><br/>
                <br/>
                <span className="font-bold">{risk.author}</span><br/>
                <span>{risk.email}</span>
              </div>
            </td>
            <td className="py-4 px-6 whitespace-nowrap">
              {risk.isResolved ? "Resolved" : "Needs Attention"}
            </td>
            <td className="py-4 px-6 whitespace-nowrap">
              {risk.isResolved ? "Resolved" : "Needs Attention"}
            </td>
            <td className="py-4 px-6 whitespace-nowrap">
              <select
                value={selectedRiskStatus}
                onChange={handleSelectRiskStatusUpdate}
                className="block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option>Unresolved</option>
                <option value={RiskStatus.RESOLVED_FALSE_POSITIVE}>This is a false positive</option>
                <option value={RiskStatus.RESOLVED_REVOKED}>I have rotated the secret, resolve risk</option>
                <option value={RiskStatus.RESOLVED_NOT_REVOKED}>No rotate needed, resolve</option>
              </select>
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>

    </div>
  );
}
