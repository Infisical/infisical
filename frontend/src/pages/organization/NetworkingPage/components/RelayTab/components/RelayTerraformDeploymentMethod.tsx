import { faCopy, faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tab } from "@headlessui/react";
import { useMemo, useState } from "react";
import { SingleValue } from "react-select";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FilterableSelect,
  FormLabel,
  IconButton,
  Input,
  ModalClose,
  Tooltip
} from "@app/components/v2";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import {
  useAddIdentityTokenAuth,
  useCreateTokenIdentityTokenAuth,
  useGetIdentityMembershipOrgs,
  useGetIdentityTokenAuth
} from "@app/hooks/api";
import { slugSchema } from "@app/lib/schemas";

const baseFormSchema = z.object({
  name: slugSchema({ field: "name" })
});

const formSchemaWithIdentity = baseFormSchema.extend({
  identity: z
    .object(
      {
        id: z.string(),
        name: z.string()
      },
      { required_error: "Identity is required" }
    )
    .nullable()
    .refine((val) => val !== null, { message: "Identity is required" })
});

const formSchemaWithToken = baseFormSchema.extend({
  identityToken: z.string().min(1, "Token is required")
});

const ec2FormSchema = z.object({
  awsRegion: z.string().min(1, "AWS Region is required"),
  vpcId: z.string().min(1, "VPC ID is required"),
  ami: z.string().min(1, "AMI ID is required"),
  subnetId: z.string().min(1, "Subnet ID is required")
});

export const RelayTerraformDeploymentMethod = () => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const [autogenerateToken, setAutogenerateToken] = useState(true);
  const [step, setStep] = useState<"form" | "command">("form");
  const [name, setName] = useState("");

  const [identity, setIdentity] = useState<null | {
    id: string;
    name: string;
  }>(null);
  const [identityToken, setIdentityToken] = useState("");
  const [formErrors, setFormErrors] = useState<z.ZodIssue[]>([]);

  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [vpcId, setVpcId] = useState("");
  const [ami, setAmi] = useState("ami-01b2110eef525172b");
  const [subnetId, setSubnetId] = useState("");

  const errors = useMemo(() => {
    const errorMap: Record<string, string | undefined> = {};
    formErrors.forEach((issue) => {
      if (issue.path.length > 0) {
        errorMap[String(issue.path[0])] = issue.message;
      }
    });
    return errorMap;
  }, [formErrors]);

  const { currentOrg } = useOrganization();
  const organizationId = currentOrg?.id || "";

  const { permission } = useOrgPermission();
  const canCreateToken = permission.can(
    OrgPermissionIdentityActions.CreateToken,
    OrgPermissionSubjects.Identity
  );

  const { data: identityMembershipOrgsData, isPending: isIdentitiesLoading } =
    useGetIdentityMembershipOrgs({
      organizationId,
      limit: 20000
    });
  const identityMembershipOrgs = identityMembershipOrgsData?.identityMemberships || [];

  const { mutateAsync: createToken, isPending: isCreatingToken } =
    useCreateTokenIdentityTokenAuth();
  const { mutateAsync: addIdentityTokenAuth, isPending: isAddingTokenAuth } =
    useAddIdentityTokenAuth();
  const { refetch } = useGetIdentityTokenAuth(identity?.id ?? "");

  const handleGenerateCommand = async () => {
    setFormErrors([]);

    if (canCreateToken && autogenerateToken) {
      const validation = formSchemaWithIdentity.safeParse({ name, identity });
      if (!validation.success) {
        setFormErrors(validation.error.issues);
        return;
      }

      if (selectedTabIndex === 0) {
        const ec2Validation = ec2FormSchema.safeParse({ awsRegion, vpcId, ami, subnetId });
        if (!ec2Validation.success) {
          setFormErrors(ec2Validation.error.issues);
          return;
        }
      }

      const validatedIdentity = validation.data.identity;

      try {
        const { data: identityTokenAuth } = await refetch();
        if (!identityTokenAuth) {
          await addIdentityTokenAuth({
            identityId: validatedIdentity.id,
            organizationId,
            accessTokenTTL: 2592000,
            accessTokenMaxTTL: 2592000,
            accessTokenNumUsesLimit: 0,
            accessTokenTrustedIps: [{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]
          });
          createNotification({
            text: "Token authentication has been automatically enabled for the selected identity. By default, it is configured to allow all IP addresses with a default token TTL of 30 days. You can manage these settings in Access Control.",
            type: "warning"
          });
        }

        const token = await createToken({
          identityId: validatedIdentity.id,
          name: `relay token for ${name} (autogenerated)`
        });
        setIdentityToken(token.accessToken);
        createNotification({
          text: "Automatically generated a token for the selected identity.",
          type: "info"
        });
        setStep("command");
      } catch (err) {
        console.error(err);
        createNotification({
          text: "Failed to generate token for the selected identity",
          type: "error"
        });
        setIdentityToken("");
      }
    } else {
      const validation = formSchemaWithToken.safeParse({
        name,
        identityToken
      });
      if (!validation.success) {
        setFormErrors(validation.error.issues);
        return;
      }

      if (selectedTabIndex === 0) {
        const ec2Validation = ec2FormSchema.safeParse({ awsRegion, vpcId, ami, subnetId });
        if (!ec2Validation.success) {
          setFormErrors(ec2Validation.error.issues);
          return;
        }
      }
      setStep("command");
    }
  };

  const terraformCommand = useMemo(() => {
    return `terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "${awsRegion}"
}

# Security Group for the Infisical Relay instance
resource "aws_security_group" "infisical_relay_sg" {
  name        = "${name}-relay-sg"
  description = "Allows inbound traffic for Infisical Relay and SSH"
  vpc_id      = "${vpcId}"

  # Inbound: Allows the Infisical platform to securely communicate with the Relay server.
  ingress {
    from_port   = 8443
    to_port     = 8443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Inbound: Allows Infisical Gateway to securely communicate via the Relay.
  ingress {
    from_port   = 2222
    to_port     = 2222
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Inbound: Allows secure shell (SSH) access for administration.
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Restrict this to your IP in production
  }

  # Outbound: Allows the Relay server to make necessary outbound connections to the Infisical platform.
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${name}-relay-sg"
  }
}

# Elastic IP for a static public IP address
resource "aws_eip" "infisical_relay_eip" {
  tags = {
    Name = "${name}-relay-eip"
  }
}

# EC2 instance to run Infisical Relay
module "infisical_relay_instance" {
  source  = "terraform-aws-modules/ec2-instance/aws"
  version = "~> 5.6"

  name          = "${name}-relay-instance"
  ami           = "${ami}"
  instance_type = "t3.micro"
  subnet_id     = "${subnetId}"

  vpc_security_group_ids      = [aws_security_group.infisical_relay_sg.id]
  associate_public_ip_address = false # We are using an Elastic IP instead

  user_data = <<-EOT
    #!/bin/bash
    set -e
    # Install Infisical CLI
    curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash
    apt-get update && apt-get install -y infisical

    # Install the relay as a systemd service.
    # This example uses a Machine Identity token for authentication via the INFISICAL_TOKEN environment variable.
    #
    # Note: For production environments, you might consider fetching the token from AWS Parameter Store or AWS Secrets Manager.
    export INFISICAL_TOKEN="${identityToken}"
    sudo -E infisical relay systemd install \\
      --name "${name}" \\
      --domain "${siteURL}" \\
      --host "\${aws_eip.infisical_relay_eip.public_ip}"

    # Start and enable the service to run on boot
    sudo systemctl start infisical-relay
    sudo systemctl enable infisical-relay
  EOT
}

# Associate the Elastic IP with the EC2 instance
resource "aws_eip_association" "eip_assoc" {
  instance_id   = module.infisical_relay_instance.id
  allocation_id = aws_eip.infisical_relay_eip.id
}
`;
  }, [name, siteURL, identityToken, awsRegion, vpcId, ami, subnetId]);

  if (step === "command") {
    return (
      <>
        <div className="mb-2 flex items-center justify-between">
          <span>Terraform Configuration</span>
          <IconButton
            ariaLabel="copy"
            variant="outline_bg"
            colorSchema="secondary"
            onClick={() => {
              navigator.clipboard.writeText(terraformCommand);
              createNotification({
                text: "Terraform configuration copied to clipboard",
                type: "info"
              });
            }}
            className="w-10"
          >
            <FontAwesomeIcon icon={faCopy} />
          </IconButton>
        </div>
        <div className="h-80 overflow-y-auto rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 font-mono text-sm text-bunker-300">
          <pre>
            <code>{terraformCommand}</code>
          </pre>
        </div>
        <div className="mt-6 flex items-center">
          <ModalClose asChild>
            <Button className="mr-4" size="sm" colorSchema="secondary">
              Done
            </Button>
          </ModalClose>
        </div>
      </>
    );
  }

  return (
    <>
      <FormLabel label="Name" tooltipText="The name for your relay." />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter relay name..."
        isError={Boolean(errors.name)}
      />
      {errors.name && <p className="mt-1 text-sm text-red">{errors.name}</p>}

      {canCreateToken && autogenerateToken ? (
        <>
          <FormLabel
            label="Machine Identity"
            tooltipText="The machine identity that your relay will use for authentication."
            className="mt-4"
          />
          <FilterableSelect
            value={identity}
            onChange={(e) =>
              setIdentity(
                e as SingleValue<{
                  id: string;
                  name: string;
                }>
              )
            }
            isLoading={isIdentitiesLoading}
            placeholder="Select machine identity..."
            options={identityMembershipOrgs.map((membership) => membership.identity)}
            getOptionValue={(option) => option.id}
            getOptionLabel={(option) => option.name}
          />
          {errors.identity && <p className="mt-1 text-sm text-red">{errors.identity}</p>}
        </>
      ) : (
        <>
          <FormLabel
            label="Machine Identity Token"
            tooltipText="The machine identity token that your relay will use for authentication."
            className="mt-4"
          />
          <Input
            value={identityToken}
            onChange={(e) => setIdentityToken(e.target.value)}
            placeholder="Enter identity token..."
            isError={Boolean(errors.identityToken)}
          />
          {errors.identityToken && <p className="mt-1 text-sm text-red">{errors.identityToken}</p>}
        </>
      )}

      {canCreateToken && (
        <div className="mt-2">
          <Checkbox
            isChecked={autogenerateToken}
            onCheckedChange={(e) => {
              setAutogenerateToken(Boolean(e));
            }}
            id="autogenerate-token"
            className="mr-2"
          >
            <div className="flex items-center">
              <span>Automatically enable token auth and generate a token for machine identity</span>
              <Tooltip
                className="max-w-md"
                content={
                  <>
                    Token authentication will be automatically enabled for the selected machine
                    identity if it isn&apos;t already configured. By default, it will be configured
                    to allow all IP addresses with a token TTL of 30 days. You can manage these
                    settings in Access Control.
                    <br />
                    <br />A token will automatically be generated to be used with the CLI command.
                  </>
                }
              >
                <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="mt-0.5 ml-1" />
              </Tooltip>
            </div>
          </Checkbox>
        </div>
      )}

      <Tab.Group selectedIndex={selectedTabIndex} onChange={setSelectedTabIndex}>
        <Tab.List className="-pb-1 mt-4 mb-6 w-full border-b-2 border-mineshaft-600">
          <Tab
            className={({ selected }) =>
              `-mb-[0.14rem] px-4 py-2 text-sm font-medium whitespace-nowrap outline-hidden disabled:opacity-60 ${
                selected ? "border-b-2 border-mineshaft-300 text-mineshaft-200" : "text-bunker-300"
              }`
            }
          >
            EC2
          </Tab>
        </Tab.List>
        <Tab.Panels className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
          <Tab.Panel>
            <FormLabel label="AWS Region" />
            <FilterableSelect
              value={AWS_REGIONS.find((r) => r.slug === awsRegion)}
              onChange={(selected) => {
                if (selected) {
                  setAwsRegion((selected as SingleValue<{ slug: string; name: string }>)!.slug);
                }
              }}
              options={AWS_REGIONS}
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.slug}
            />
            {errors.awsRegion && <p className="mt-1 text-sm text-red">{errors.awsRegion}</p>}
            <FormLabel label="VPC ID" className="mt-4" />
            <Input
              value={vpcId}
              onChange={(e) => setVpcId(e.target.value)}
              placeholder="vpc-..."
              isError={Boolean(errors.vpcId)}
            />
            {errors.vpcId && <p className="mt-1 text-sm text-red">{errors.vpcId}</p>}
            <FormLabel
              label="AMI ID"
              tooltipText="The ID of the Amazon Machine Image (AMI) for the EC2 linux instance."
              className="mt-4"
            />
            <Input
              value={ami}
              onChange={(e) => setAmi(e.target.value)}
              placeholder="ami-..."
              isError={Boolean(errors.ami)}
            />
            {errors.ami && <p className="mt-1 text-sm text-red">{errors.ami}</p>}
            <FormLabel label="Subnet ID" className="mt-4" />
            <Input
              value={subnetId}
              onChange={(e) => setSubnetId(e.target.value)}
              placeholder="subnet-..."
              isError={Boolean(errors.subnetId)}
            />
            {errors.subnetId && <p className="mt-1 text-sm text-red">{errors.subnetId}</p>}
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>

      <div className="mt-6 flex items-center">
        <Button
          className="mr-4"
          size="sm"
          colorSchema="secondary"
          onClick={handleGenerateCommand}
          isLoading={isCreatingToken || isAddingTokenAuth}
        >
          Continue
        </Button>
        <ModalClose asChild>
          <Button colorSchema="secondary" variant="plain">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </>
  );
};
