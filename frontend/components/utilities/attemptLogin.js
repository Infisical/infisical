import login1 from "~/pages/api/auth/Login1";
import login2 from "~/pages/api/auth/Login2";
import Aes256Gcm from "~/components/aes-256-gcm";
import pushKeys from "./pushKeys";
import { initPostHog } from "../analytics/posthog";
import getOrganizations from "~/pages/api/organization/getOrgs";
import getOrganizationUserProjects from "~/pages/api/organization/GetOrgUserProjects";
import SecurityClient from "./SecurityClient";
import { ENV } from "./config";

const nacl = require("tweetnacl");
nacl.util = require("tweetnacl-util");
const jsrp = require("jsrp");
const client = new jsrp.client();

/**
 * This function loggs in the user (whether it's right after signup, or a normal login)
 * @param {*} email
 * @param {*} password
 * @param {*} setErrorLogin
 * @param {*} router
 * @param {*} isSignUp
 * @returns
 */
const attemptLogin = async (
	email,
	password,
	setErrorLogin,
	router,
	isSignUp,
	isLogin
) => {
	try {
		let userWorkspace, userOrg;
		client.init(
			{
				username: email,
				password: password,
			},
			async () => {
				const clientPublicKey = client.getPublicKey();

				let serverPublicKey, salt;
				try {
					const res = await login1(email, clientPublicKey);
					res = await res.json();
					serverPublicKey = res.serverPublicKey;
					salt = res.salt;
				} catch (err) {
					setErrorLogin(true);
					console.log("Wrong password", err);
				}

				let response;
				try {
					client.setSalt(salt);
					client.setServerPublicKey(serverPublicKey);
					const clientProof = client.getProof(); // called M1
					response = await login2(email, clientProof);
				} catch (err) {
					setErrorLogin(true);
					console.log("Password verification failed");
				}

				// if everything works, go the main dashboard page.
				try {
					if (response.status == "200") {
						response = await response.json();
						SecurityClient.setToken(response["token"]);
						const publicKey = response["publicKey"];
						const encryptedPrivateKey =
							response["encryptedPrivateKey"];
						const iv = response["iv"];
						const tag = response["tag"];

						const PRIVATE_KEY = Aes256Gcm.decrypt(
							encryptedPrivateKey,
							iv,
							tag,
							password
								.slice(0, 32)
								.padStart(
									32 +
										(password.slice(0, 32).length -
											new Blob([password]).size),
									"0"
								)
						);

						try {
							localStorage.setItem("publicKey", publicKey);
							localStorage.setItem(
								"encryptedPrivateKey",
								encryptedPrivateKey
							);
							localStorage.setItem("iv", iv);
							localStorage.setItem("tag", tag);
							localStorage.setItem("PRIVATE_KEY", PRIVATE_KEY);
						} catch (err) {
							setErrorLogin(true);
							console.error(
								"Unable to send the tokens in local storage:" +
									err.message
							);
						}
					} else {
						setErrorLogin(true);
					}

					const userOrgs = await getOrganizations();
					const userOrgsData = userOrgs.map((org) => org._id);

					let orgToLogin;
					if (
						userOrgsData.includes(
							localStorage.getItem("orgData.id")
						)
					) {
						orgToLogin = localStorage.getItem("orgData.id");
					} else {
						orgToLogin = userOrgsData[0];
						localStorage.setItem("orgData.id", orgToLogin);
					}

					let orgUserProjects = await getOrganizationUserProjects({
						orgId: orgToLogin,
					});

					orgUserProjects = orgUserProjects?.map(
						(project) => project._id
					);
					let projectToLogin;
					if (
						orgUserProjects.includes(
							localStorage.getItem("projectData.id")
						)
					) {
						projectToLogin = localStorage.getItem("projectData.id");
					} else {
						try {
							projectToLogin = orgUserProjects[0];
							localStorage.setItem(
								"projectData.id",
								projectToLogin
							);
						} catch (error) {
							console.log(
								"ERROR: User likely has no projects. ",
								error
							);
						}
					}

					// If user is logging in for the first time, add the example keys
					if (isSignUp) {
						await pushKeys(
							{
								DATABASE_URL: [
									"mongodb+srv://this_is:an_example@mongodb.net",
									"personal",
								],
								TWILIO_AUTH_TOKEN: [
									"hgSIwDAKvz8PJfkj6xkzYqzGmAP3HLuG",
									"shared",
								],
								WEBSITE_URL: [
									"http://localhost:3000",
									"shared",
								],
								STRIPE_SECRET_KEY: [
									"sk_test_7348oyho4hfq398HIUOH78",
									"shared",
								],
							},
							projectToLogin,
							"Development"
						);
					}
					try {
						if (email) {
							if (ENV == "production") {
								const posthog = initPostHog();
								posthog.identify(email);
								posthog.capture("User Logged In");
							}
						}
					} catch (error) {
						console.log("posthog", error);
					}

					if (isLogin) {
						router.push("/dashboard/");
					}
				} catch (error) {
					setErrorLogin(true);
					console.log("Login response not available");
				}
			}
		);
	} catch (error) {
		console.log("Something went wrong during authentication");
	}
	return true;
};

export default attemptLogin;
