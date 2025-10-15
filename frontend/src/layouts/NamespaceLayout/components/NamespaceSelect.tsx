import { useState } from "react";
import {
  faCaretDown,
  faCheck,
  faCubes,
  faMagnifyingGlass,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { NewNamespaceModal } from "@app/components/namespace";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Input,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import { namespacesQueryKeys } from "@app/hooks/api/namespaces";

type Props = {
  namespaceId: string;
};

export const NamespaceSelect = ({ namespaceId }: Props) => {
  const [searchNamespace, setSearchNamespace] = useState("");
  const navigate = useNavigate();
  const { data: currentNamespace } = useQuery(
    namespacesQueryKeys.detail({
      namespaceId
    })
  );
  const { data: { namespaces = [] } = {} } = useQuery(namespacesQueryKeys.list());
  const { subscription } = useSubscription();

  const isAddingNamespacesAllowed = Boolean(subscription?.namespace);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addNewWs",
    "upgradePlan"
  ] as const);

  return (
    <div className="-mr-2 flex w-full items-center gap-1">
      <DropdownMenu modal={false}>
        <Link
          to="/organization/namespaces/$namespaceId"
          params={{
            namespaceId
          }}
        >
          <div className="relative flex cursor-pointer items-center gap-2 text-sm text-white duration-100 hover:text-primary">
            <Tooltip content={currentNamespace?.name} className="max-w-96 break-words">
              <Badge
                variant="namespace"
                className="max-w-44 overflow-hidden text-sm text-ellipsis whitespace-nowrap"
              >
                <FontAwesomeIcon icon={faCubes} />

                {currentNamespace?.name}
              </Badge>
            </Tooltip>
          </div>
        </Link>
        <DropdownMenuTrigger asChild>
          <div>
            <IconButton
              variant="plain"
              colorSchema="secondary"
              ariaLabel="switch-namespace"
              className="px-2 py-1"
            >
              <FontAwesomeIcon icon={faCaretDown} className="text-xs text-bunker-300" />
            </IconButton>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="bottom"
          className="mt-6 cursor-default p-1 shadow-mineshaft-600 drop-shadow-md"
          style={{ minWidth: "220px" }}
        >
          <div className="px-2 py-1 text-xs text-mineshaft-400 capitalize">Namespaces</div>
          <div className="mb-1 border-b border-b-mineshaft-600 py-1 pb-1">
            <Input
              value={searchNamespace}
              onChange={(evt) => setSearchNamespace(evt.target.value || "")}
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              size="xs"
              variant="plain"
              placeholder="Search namespaces"
            />
          </div>
          <div className="max-h-80 thin-scrollbar overflow-auto">
            {namespaces
              ?.filter((el) => el.name?.toLowerCase().includes(searchNamespace.toLowerCase()))
              ?.map((namespace) => {
                return (
                  <DropdownMenuItem
                    key={namespace.id}
                    onClick={async () => {
                      navigate({
                        to: "/organization/namespaces/$namespaceId",
                        params: {
                          namespaceId: namespace.id
                        }
                      });
                    }}
                    icon={
                      currentNamespace?.id === namespace.id && (
                        <FontAwesomeIcon icon={faCheck} className="mr-3 text-primary" />
                      )
                    }
                  >
                    <div className="flex items-center">
                      <div className="flex flex-1 items-center justify-between overflow-hidden">
                        <Tooltip side="right" className="break-words" content={namespace.name}>
                          <div className="max-w-40 truncate overflow-hidden whitespace-nowrap">
                            {namespace.name}
                          </div>
                        </Tooltip>
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
          </div>
          <div className="mt-1 h-1 border-t border-mineshaft-600" />
          <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Namespace}>
            {(isAllowed) => (
              <DropdownMenuItem
                isDisabled={!isAllowed}
                icon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() =>
                  handlePopUpOpen(isAddingNamespacesAllowed ? "addNewWs" : "upgradePlan")
                }
              >
                New Namespace
              </DropdownMenuItem>
            )}
          </OrgPermissionCan>
        </DropdownMenuContent>
      </DropdownMenu>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your plan doesn't allow namespaces. Please contact Infisical Support."
      />
      <NewNamespaceModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
      />
    </div>
  );
};
