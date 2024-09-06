/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTranslation } from "react-i18next";
import Head from "next/head";

import { UserCredentialsPage } from "@app/views/UserCredentialsPage";

function OrgCredentialsPage() {
	// const { t } = useTranslation();

	return (
		<div className="flex w-full justify-center bg-bunker-800 py-6 text-white">
			<div className="w-full max-w-7xl px-6">
				<div className="mb-4">
					<p className="text-3xl font-semibold text-gray-200">
						User Credentials
					</p>
				</div>
				<UserCredentialsPage />
			</div>
		</div>
	);
}

export default function UserCredentials() {
	const { t } = useTranslation();

	return (
		<>
			<Head>
				<title>{t("common.head-title", { title: t("settings.org.title") })}</title>
				<link rel="icon" href="/infisical.ico" />
			</Head>
			<OrgCredentialsPage />
		</>
	);
}

UserCredentials.requireAuth = true;

