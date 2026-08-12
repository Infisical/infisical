import { useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  FileKey,
  KeyRound,
  LockKeyhole,
  MoreHorizontal,
  Radar,
  Server,
  Share2,
  SlidersHorizontal,
  Users
} from "lucide-react";

import { CertManagerNotConfiguredModal } from "@app/components/projects/CertManagerNotConfiguredModal";
import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";

export const ProductLauncher = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { currentOrg } = useOrganization();
  const { data: certManagerInstance, isPending: isCertManagerPending } =
    useCertManagerInstanceState();
  const [isCertManagerSetupOpen, setIsCertManagerSetupOpen] = useState(false);

  const openCertificateManager = () => {
    if (isCertManagerPending) return;

    if (!certManagerInstance?.activeProjectId) {
      setIsCertManagerSetupOpen(true);
      return;
    }

    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/overview",
      params: { orgId: currentOrg.id, projectId: certManagerInstance.activeProjectId }
    });
  };

  const productItems = (
    <>
      <DropdownMenuItem asChild>
        <Link
          to="/organizations/$orgId/projects/$type"
          params={{ orgId: currentOrg.id, type: "secret-management" }}
        >
          <KeyRound className="text-product-sm" />
          Secrets
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={openCertificateManager} disabled={isCertManagerPending}>
        <FileKey className="text-product-pki" />
        PKI
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link
          to="/organizations/$orgId/projects/$type"
          params={{ orgId: currentOrg.id, type: "kms" }}
        >
          <LockKeyhole className="text-product-kms" />
          KMS
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link
          to="/organizations/$orgId/projects/$type"
          params={{ orgId: currentOrg.id, type: "secret-scanning" }}
        >
          <Radar className="text-product-ss" />
          Scanners
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/organizations/$orgId/pam/access" params={{ orgId: currentOrg.id }}>
          <Users className="text-product-pam" />
          PAM
        </Link>
      </DropdownMenuItem>
    </>
  );

  return (
    <>
      <div className="mr-2 flex items-center">
        <ButtonGroup className="hidden 2xl:flex">
          <Button
            variant="outline"
            size="sm"
            className={pathname.includes("/secret-management") ? "bg-foreground/5" : undefined}
            asChild
          >
            <Link
              to="/organizations/$orgId/projects/$type"
              params={{ orgId: currentOrg.id, type: "secret-management" }}
            >
              <KeyRound className="text-product-sm" />
              Secrets
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={pathname.includes("/cert-manager") ? "bg-foreground/5" : undefined}
            onClick={openCertificateManager}
            isDisabled={isCertManagerPending}
          >
            <FileKey className="text-product-pki" />
            PKI
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={pathname.includes("/projects/kms") ? "bg-foreground/5" : undefined}
            asChild
          >
            <Link
              to="/organizations/$orgId/projects/$type"
              params={{ orgId: currentOrg.id, type: "kms" }}
            >
              <LockKeyhole className="text-product-kms" />
              KMS
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={pathname.includes("/secret-scanning") ? "bg-foreground/5" : undefined}
            asChild
          >
            <Link
              to="/organizations/$orgId/projects/$type"
              params={{ orgId: currentOrg.id, type: "secret-scanning" }}
            >
              <Radar className="text-product-ss" />
              Scanners
            </Link>
          </Button>
        </ButtonGroup>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="2xl:hidden">
              Products
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{productItems}</DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="hidden 2xl:inline-flex">
              More
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-60">
            <DropdownMenuItem asChild>
              <Link to="/organizations/$orgId/pam/access" params={{ orgId: currentOrg.id }}>
                <Users className="text-product-pam" />
                PAM
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                to="/organizations/$orgId/projects/secret-management/secret-sharing"
                params={{ orgId: currentOrg.id }}
              >
                <Share2 />
                Secret Sharing
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to="/organizations/$orgId/projects/kms/kmip-servers"
                params={{ orgId: currentOrg.id }}
              >
                <Server />
                KMIP Servers
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                to="/organizations/$orgId/projects/secret-management/product-settings"
                params={{ orgId: currentOrg.id }}
              >
                <SlidersHorizontal />
                Secrets Product Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to="/organizations/$orgId/settings"
                params={{ orgId: currentOrg.id }}
                search={{ selectedTab: "product-settings" }}
              >
                <SlidersHorizontal />
                PKI Product Settings
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CertManagerNotConfiguredModal
        isOpen={isCertManagerSetupOpen}
        onOpenChange={setIsCertManagerSetupOpen}
      />
    </>
  );
};
