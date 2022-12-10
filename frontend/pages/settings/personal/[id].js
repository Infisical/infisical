import React, { useEffect, useState } from "react";
import Head from "next/head";
import { faCheck, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "~/components/basic/buttons/Button";
import InputField from "~/components/basic/InputField";
import NavHeader from "~/components/navigation/NavHeader";
import changePassword from "~/components/utilities/cryptography/changePassword";
import issueBackupKey from "~/components/utilities/cryptography/issueBackupKey";
import passwordCheck from "~/utilities/checks/PasswordCheck";

import getUser from "../../api/user/getUser";

export default function PersonalSettings() {
  const [personalEmail, setPersonalEmail] = useState("");
  const [personalName, setPersonalName] = useState("");
  const [passwordErrorLength, setPasswordErrorLength] = useState(false);
  const [passwordErrorNumber, setPasswordErrorNumber] = useState(false);
  const [passwordErrorLowerCase, setPasswordErrorLowerCase] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [backupKeyIssued, setBackupKeyIssued] = useState(false);
  const [backupKeyError, setBackupKeyError] = useState(false);

  useEffect(async () => {
    let user = await getUser();
    setPersonalEmail(user.email);
    setPersonalName(user.firstName + " " + user.lastName);
  }, []);

  return (
    <div className="bg-bunker-800 max-h-screen flex flex-col justify-between text-white">
      <Head>
        <title>Personal Settings</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <div className="flex flex-row">
        <div className="w-full max-h-screen pb-2 overflow-y-auto">
          <NavHeader pageName="Personal Settings" isProjectRelated={false} />
          <div className="flex flex-row justify-between items-center ml-6 mt-8 mb-6 text-xl max-w-5xl">
            <div className="flex flex-col justify-start items-start text-3xl">
              <p className="font-semibold mr-4 text-gray-200">
                Personal Settings
              </p>
              <p className="font-normal mr-4 text-gray-400 text-base">
                View and manage your personal information here.
              </p>
            </div>
          </div>
          <div className="flex flex-col ml-6 text-mineshaft-50 mr-6 max-w-5xl">
            <div className="flex flex-col">
              <div className="min-w-md flex flex-col items-end pb-4">
                {/* <div className="bg-white/5 rounded-md px-6 py-4 flex flex-col items-start flex flex-col items-start w-full mb-6">
									<div className="max-h-28 w-full max-w-md mr-auto">
										<p className="font-semibold mr-4 text-gray-200 text-xl mb-2">
											Display Name
										</p>
										<InputField
											onChangeHandler={modifyOrgName}
											type="varName"
											value={orgName}
											placeholder=""
											isRequired
										/>
									</div>
									<div className="flex justify-start w-full">
										<div
											className={`flex justify-start max-w-sm mt-4 mb-2 rounded-md bg-gray-800 text-sm ${
												buttonReady &&
												"hover:bg-primary hover:text-black hover:text-semibold duration-200 cursor-pointer"
											} text-gray-400 px-4 py-2.5`}
										>
											{buttonReady ? (
												<button
													type="button"
													className="flex flex-start justify-center font-medium px-2"
													onClick={() =>
														submitChanges(orgName)
													}
												>
													Save Changes
												</button>
											) : (
												<div className="flex flex-row items-center jutify-center px-4">
													<FontAwesomeIcon
														className="text-lg mr-3 text-gray-400"
														icon={faCheck}
													/>
													<p className="font-base">
														Saved
													</p>
												</div>
											)}
										</div>
									</div>
								</div> */}
              </div>
            </div>
            <div className="bg-white/5 rounded-md px-6 pt-5 pb-6 flex flex-col items-start flex flex-col items-start w-full mb-6">
              <div className="flex flex-row max-w-5xl justify-between items-center w-full">
                <div className="flex flex-col justify-between w-full max-w-3xl">
                  <p className="text-xl font-semibold mb-3 min-w-max">
                    Change password
                  </p>
                </div>
              </div>
              <div className="max-w-xl w-full">
                <InputField
                  label="Current Password"
                  onChangeHandler={(password) => {
                    setCurrentPassword(password);
                  }}
                  type="password"
                  value={currentPassword}
                  isRequired
                  error={currentPasswordError}
                  errorText="The current password may be wrong"
                  autoComplete="current-password"
                  id="current-password"
                />
                <div className="py-2"></div>
                <InputField
                  label="New Password"
                  onChangeHandler={(password) => {
                    setNewPassword(password);
                    passwordCheck({
                      password,
                      setPasswordErrorLength,
                      setPasswordErrorNumber,
                      setPasswordErrorLowerCase,
                      currentErrorCheck: false,
                    });
                  }}
                  type="password"
                  value={newPassword}
                  isRequired
                  error={
                    passwordErrorLength &&
                    passwordErrorLowerCase &&
                    passwordErrorNumber
                  }
                  autoComplete="new-password"
                  id="new-password"
                />
              </div>
              {passwordErrorLength ||
              passwordErrorLowerCase ||
              passwordErrorNumber ? (
                <div className="w-full mt-3 bg-white/5 px-2 flex flex-col items-start py-2 rounded-md max-w-xl mb-2">
                  <div className={`text-gray-400 text-sm mb-1`}>
                    Password should contain at least:
                  </div>
                  <div className="flex flex-row justify-start items-center ml-1">
                    {passwordErrorLength ? (
                      <FontAwesomeIcon
                        icon={faX}
                        className="text-md text-red mr-2.5"
                      />
                    ) : (
                      <FontAwesomeIcon
                        icon={faCheck}
                        className="text-md text-primary mr-2"
                      />
                    )}
                    <div
                      className={`${
                        passwordErrorLength ? "text-gray-400" : "text-gray-600"
                      } text-sm`}
                    >
                      14 characters
                    </div>
                  </div>
                  <div className="flex flex-row justify-start items-center ml-1">
                    {passwordErrorLowerCase ? (
                      <FontAwesomeIcon
                        icon={faX}
                        className="text-md text-red mr-2.5"
                      />
                    ) : (
                      <FontAwesomeIcon
                        icon={faCheck}
                        className="text-md text-primary mr-2"
                      />
                    )}
                    <div
                      className={`${
                        passwordErrorLowerCase
                          ? "text-gray-400"
                          : "text-gray-600"
                      } text-sm`}
                    >
                      1 lowercase character
                    </div>
                  </div>
                  <div className="flex flex-row justify-start items-center ml-1">
                    {passwordErrorNumber ? (
                      <FontAwesomeIcon
                        icon={faX}
                        className="text-md text-red mr-2.5"
                      />
                    ) : (
                      <FontAwesomeIcon
                        icon={faCheck}
                        className="text-md text-primary mr-2"
                      />
                    )}
                    <div
                      className={`${
                        passwordErrorNumber ? "text-gray-400" : "text-gray-600"
                      } text-sm`}
                    >
                      1 number
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-2"></div>
              )}
              <div className="flex flex-row items-center mt-3 w-52 pr-3">
                <Button
                  text="Change Password"
                  onButtonPressed={() => {
                    if (
                      !passwordErrorLength &&
                      !passwordErrorLowerCase &&
                      !passwordErrorNumber
                    ) {
                      changePassword(
                        personalEmail,
                        currentPassword,
                        newPassword,
                        setCurrentPasswordError,
                        setPasswordChanged,
                        setCurrentPassword,
                        setNewPassword
                      );
                    }
                  }}
                  color="mineshaft"
                  size="md"
                  active={
                    newPassword != "" &&
                    currentPassword != "" &&
                    !(
                      passwordErrorLength ||
                      passwordErrorLowerCase ||
                      passwordErrorNumber
                    )
                  }
                  textDisabled="Change Password"
                />
                <FontAwesomeIcon
                  icon={faCheck}
                  className={`ml-4 text-primary text-3xl ${
                    passwordChanged ? "opacity-100" : "opacity-0"
                  } duration-300`}
                />
              </div>
            </div>

            <div className="bg-white/5 rounded-md px-6 pt-5 pb-6 mt-4 flex flex-col items-start flex flex-col items-start w-full mb-6">
              <div className="flex flex-row max-w-5xl justify-between items-center w-full">
                <div className="flex flex-col justify-between w-full max-w-3xl">
                  <p className="text-xl font-semibold mb-3 min-w-max">
                    Emergency Kit
                  </p>
                  <p className="text-sm text-mineshaft-300 min-w-max">
                    Your Emergency Kit contains the information you’ll need to
                    sign in to your Infisical account.
                  </p>
                  <p className="text-sm text-mineshaft-300 mb-5 min-w-max">
                    Only the latest issued Emergency Kit remains valid. To get a
                    new Emergency Kit, verify your password.
                  </p>
                </div>
              </div>
              <div className="w-full max-w-xl mb-4">
                <InputField
                  label="Current Password"
                  onChangeHandler={setBackupPassword}
                  type="password"
                  value={backupPassword}
                  isRequired
                  error={backupKeyError}
                  errorText="The current password is wrong"
                  autoComplete="current-password"
                  id="current-password"
                />
              </div>
              <div className="flex flex-row items-center mt-3 w-full w-60">
                <Button
                  text="Download Emergency Kit"
                  onButtonPressed={() => {
                    issueBackupKey({
                      email: personalEmail,
                      password: backupPassword,
                      personalName,
                      setBackupKeyError,
                      setBackupKeyIssued,
                    });
                  }}
                  color="mineshaft"
                  size="md"
                  active={backupPassword != ""}
                  textDisabled="Download Emergency Kit"
                />
                <FontAwesomeIcon
                  icon={faCheck}
                  className={`ml-4 text-primary text-3xl ${
                    backupKeyIssued ? "opacity-100" : "opacity-0"
                  } duration-300`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

PersonalSettings.requireAuth = true;
