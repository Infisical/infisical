import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
	faAngleRight,
	faQuestionCircle,
} from "@fortawesome/free-solid-svg-icons";
import { faCcMastercard, faCcVisa } from "@fortawesome/free-brands-svg-icons";
import { faCircle } from "@fortawesome/free-solid-svg-icons";
import getOrganization from "~/pages/api/organization/GetOrg";
import getWorkspaceInfo from "~/pages/api/workspace/getWorkspaceInfo";
import { useRouter } from "next/router";

export default function NavHeader({ pageName, isProjectRelated }) {
	const [orgName, setOrgName] = useState("");
	const [workspaceName, setWorkspaceName] = useState("");
	const router = useRouter();

	useEffect(async () => {
		let org = await getOrganization({
			orgId: localStorage.getItem("orgData.id"),
		});
		setOrgName(org.name);
		let workspace = await getWorkspaceInfo({
			workspaceId: router.query.id,
		});
		setWorkspaceName(workspace.name);
	}, []);

	return (
		<div className="pt-20 ml-6 flex flex-row items-center">
			<div className="bg-primary-900 h-6 w-6 rounded-md flex items-center justify-center text-mineshaft-100 mr-2">
				{orgName?.charAt(0)}
			</div>
			<div className="text-primary text-sm font-semibold">{orgName}</div>
			{isProjectRelated && (
				<>
					<FontAwesomeIcon
						icon={faAngleRight}
						className="ml-3 text-sm text-gray-400 mr-3"
					/>
					<div className="font-semibold text-primary text-sm">
						{workspaceName}
					</div>
				</>
			)}
			<FontAwesomeIcon
				icon={faAngleRight}
				className="ml-3 text-sm text-gray-400 mr-3"
			/>
			<div className="text-gray-400 text-sm">{pageName}</div>
		</div>
	);
}
