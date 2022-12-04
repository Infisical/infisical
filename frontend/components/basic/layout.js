/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  faBookOpen,
  faGear,
  faKey,
  faMobile,
  faPlug,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import getOrganizations from "~/pages/api/organization/getOrgs";
import getOrganizationUserProjects from "~/pages/api/organization/GetOrgUserProjects";
import getOrganizationUsers from "~/pages/api/organization/GetOrgUsers";
import addUserToWorkspace from "~/pages/api/workspace/addUserToWorkspace";
import createWorkspace from "~/pages/api/workspace/createWorkspace";
import getWorkspaces from "~/pages/api/workspace/getWorkspaces";

import NavBarDashboard from "../navigation/NavBarDashboard";
import {
  decryptAssymmetric,
  encryptAssymmetric,
} from "../utilities/cryptography/crypto";
import Button from "./buttons/Button";
import AddWorkspaceDialog from "./dialog/AddWorkspaceDialog";
import Listbox from "./Listbox";

export default function Layout({ children }) {
  const router = useRouter();
  const [workspaceList, setWorkspaceList] = useState([]);
  const [workspaceMapping, setWorkspaceMapping] = useState([{ 1: 2 }]);
  const [workspaceSelected, setWorkspaceSelected] = useState("∞");
  let [newWorkspaceName, setNewWorkspaceName] = useState("");
  let [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  function closeModal() {
    setIsOpen(false);
  }

  // TODO: what to do about the fact that 2ids can have the same name

  /**
   * When a user creates a new workspace, redirect them to the page of the new workspace.
   * @param {*} workspaceName
   */
  async function submitModal(workspaceName, addAllUsers) {
    setLoading(true);
    setTimeout(() => setLoading(false), 1500);
    const workspaces = await getWorkspaces();
    const currentWorkspaces = workspaces.map((workspace) => workspace.name);
    if (!currentWorkspaces.includes(workspaceName)) {
      const newWorkspace = await createWorkspace(
        workspaceName,
        localStorage.getItem("orgData.id")
      );
      let newWorkspaceId;
      try {
        newWorkspaceId = newWorkspace._id;
      } catch (error) {
        console.log(error);
      }
      if (addAllUsers) {
        let orgUsers = await getOrganizationUsers({
          orgId: localStorage.getItem("orgData.id"),
        });
        orgUsers.map(async (user) => {
          if (user.status == "accepted") {
            let result = await addUserToWorkspace(
              user.user.email,
              newWorkspaceId
            );
            if (result?.invitee && result?.latestKey) {
              const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY");

              // assymmetrically decrypt symmetric key with local private key
              const key = decryptAssymmetric({
                ciphertext: result.latestKey.encryptedKey,
                nonce: result.latestKey.nonce,
                publicKey: result.latestKey.sender.publicKey,
                privateKey: PRIVATE_KEY,
              });

              const { ciphertext, nonce } = encryptAssymmetric({
                plaintext: key,
                publicKey: result.invitee.publicKey,
                privateKey: PRIVATE_KEY,
              });

              uploadKeys(newWorkspaceId, result.invitee._id, ciphertext, nonce);
            }
          }
        });
      }
      router.push("/dashboard/" + newWorkspaceId + "?Development");
      setIsOpen(false);
      setNewWorkspaceName("");
    } else {
      setError("A project with this name already exists.");
      setLoading(false);
    }
  }

  function openModal() {
    setIsOpen(true);
  }

  const menuItems = [
    {
      href:
        "/dashboard/" + workspaceMapping[workspaceSelected] + "?Development",
      title: "Secrets",
      emoji: <FontAwesomeIcon icon={faKey} />,
    },
    {
      href: "/users/" + workspaceMapping[workspaceSelected],
      title: "Members",
      emoji: <FontAwesomeIcon icon={faUser} />,
    },
    {
      href: "/integrations/" + workspaceMapping[workspaceSelected],
      title: "Integrations",
      emoji: <FontAwesomeIcon icon={faPlug} />,
    },
    {
      href: "/settings/project/" + workspaceMapping[workspaceSelected],
      title: "Project Settings",
      emoji: <FontAwesomeIcon icon={faGear} />,
    },
  ];

  useEffect(async () => {
    // Put a user in a workspace if they're not in one yet
    if (
      localStorage.getItem("orgData.id") == null ||
      localStorage.getItem("orgData.id") == ""
    ) {
      const userOrgs = await getOrganizations();
      localStorage.setItem("orgData.id", userOrgs[0]._id);
    }

    let orgUserProjects = await getOrganizationUserProjects({
      orgId: localStorage.getItem("orgData.id"),
    });
    let userWorkspaces = orgUserProjects;
    if (
      userWorkspaces.length == 0 &&
      router.asPath != "/noprojects" &&
      !router.asPath.includes("settings")
    ) {
      router.push("/noprojects");
    } else if (router.asPath != "/noprojects") {
      const intendedWorkspaceId = router.asPath
        .split("/")
        [router.asPath.split("/").length - 1].split("?")[0];

      // If a user is not a member of a workspace they are trying to access, just push them to one of theirs
      if (
        intendedWorkspaceId != "heroku" &&
        !userWorkspaces
          .map((workspace) => workspace._id)
          .includes(intendedWorkspaceId)
      ) {
        router.push("/dashboard/" + userWorkspaces[0]._id + "?Development");
      } else {
        setWorkspaceList(userWorkspaces.map((workspace) => workspace.name));
        setWorkspaceMapping(
          Object.fromEntries(
            userWorkspaces.map((workspace) => [workspace.name, workspace._id])
          )
        );
        setWorkspaceSelected(
          Object.fromEntries(
            userWorkspaces.map((workspace) => [workspace._id, workspace.name])
          )[
            router.asPath
              .split("/")
              [router.asPath.split("/").length - 1].split("?")[0]
          ]
        );
      }
    }
  }, []);

  useEffect(() => {
    try {
      if (
        workspaceMapping[workspaceSelected] &&
        workspaceMapping[workspaceSelected] !==
          router.asPath
            .split("/")
            [router.asPath.split("/").length - 1].split("?")[0]
      ) {
        router.push(
          "/dashboard/" + workspaceMapping[workspaceSelected] + "?Development"
        );
        localStorage.setItem(
          "projectData.id",
          workspaceMapping[workspaceSelected]
        );
      }
    } catch (error) {
      console.log(error);
    }
  }, [workspaceSelected]);

  return (
    <>
      <div className="fixed w-full hidden md:block flex flex-col h-screen">
        <NavBarDashboard />
        <div className="flex flex-col md:flex-row flex-1">
          <aside className="bg-bunker-600 border-r border-mineshaft-500 w-full md:w-60 h-screen">
            <nav className="flex flex-col justify-between items-between h-full">
              {/* <div className="py-6"></div> */}
              <div>
                <div className="flex justify-center w-full mt-[4.5rem] mb-6 bg-bunker-600 w-full h-20 flex flex-col items-center px-4">
                  <div className="text-gray-400 self-start ml-1 mb-1 text-xs font-semibold tracking-wide">
                    PROJECT
                  </div>
                  {workspaceList.length > 0 ? (
                    <Listbox
                      selected={workspaceSelected}
                      onChange={setWorkspaceSelected}
                      data={workspaceList}
                      buttonAction={openModal}
                      text=""
                      workspaceMapping={workspaceMapping}
                    />
                  ) : (
                    <Button
                      text="Add Project"
                      onButtonPressed={openModal}
                      color="mineshaft"
                      size="md"
                      icon={faPlus}
                    />
                  )}
                </div>
                <ul>
                  {workspaceList.length > 0 &&
                    menuItems.map(({ href, title, emoji }) => (
                      <li className="mt-0.5 mx-2" key={title}>
                        {router.asPath.split("/")[1] === href.split("/")[1] &&
                        (["project", "billing", "org", "personal"].includes(
                          router.asPath.split("/")[2]
                        )
                          ? router.asPath.split("/")[2] === href.split("/")[2]
                          : true) ? (
                          <div
                            className={`flex relative px-0.5 py-2.5 text-white text-sm rounded cursor-pointer bg-primary-50/10`}
                          >
                            <div className="absolute top-0 my-1 ml-1 inset-0 bg-primary w-1 rounded-xl mr-1"></div>
                            <p className="w-6 ml-4 mr-2 flex items-center justify-center text-lg">{emoji}</p>
                            {title}
                          </div>
                        ) : router.asPath == "/noprojects" ? (
                          <div className={`flex p-2.5 text-white text-sm rounded`}>
                            <p className="w-10 flex items-center justify-center text-lg">{emoji}</p>
                            {title}
                          </div>
                        ) : (
                          <Link href={href}>
                            <div
                              className={`flex p-2.5 text-white text-sm rounded cursor-pointer hover:bg-primary-50/5`}
                            >
                              <p className="w-10 flex items-center justify-center text-lg">{emoji}</p>
                              {title}
                            </div>
                          </Link>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
              <div className="w-full mt-40 mb-4 px-2">
                {router.asPath.split("/")[1] === "home" ? (
                  <div
                    className={`flex relative px-0.5 py-2.5 text-white text-sm rounded cursor-pointer bg-primary-50/10`}
                  >
                    <div className="absolute top-0 my-1 ml-1 inset-0 bg-primary w-1 rounded-xl mr-1"></div>
                    <p className="w-6 ml-4 mr-2 flex items-center justify-center text-lg"><FontAwesomeIcon icon={faBookOpen}/></p>
                    Infisical Guide
                  </div>
                ) : (
                  <Link href={`/home/` + workspaceMapping[workspaceSelected]}>
                    <div
                      className={`flex p-2.5 text-white text-sm rounded cursor-pointer hover:bg-primary-50/5 mt-max border border-dashed border-bunker-400`}
                    >
                      <p className="w-10 flex items-center justify-center text-lg"><FontAwesomeIcon icon={faBookOpen}/></p>
                      Infisical Guide
                    </div>
                  </Link>
                )}
              </div>
            </nav>
          </aside>
          <AddWorkspaceDialog
            isOpen={isOpen}
            closeModal={closeModal}
            submitModal={submitModal}
            workspaceName={newWorkspaceName}
            setWorkspaceName={setNewWorkspaceName}
            error={error}
            loading={loading}
          />
          <main className="flex-1 bg-bunker-800">{children}</main>
        </div>
      </div>
      <div className="block md:hidden bg-bunker-800 w-screen h-screen flex flex-col justify-center items-center">
        <FontAwesomeIcon
          icon={faMobile}
          className="text-gray-300 text-7xl mb-8"
        />
        <p className="text-gray-200 px-6 text-center text-lg max-w-sm">
          {" "}
          To use Infisical, please log in through a device with larger
          dimensions.{" "}
        </p>
      </div>
    </>
  );
}
