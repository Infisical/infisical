import { ForbiddenError } from "@casl/ability";
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { randomBytes } from 'crypto';
import { CloudFormationClient, CreateStackCommand, DescribeStacksCommand, DescribeStackEventsCommand } from "@aws-sdk/client-cloudformation";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TDedicatedInstanceDALFactory } from "./dedicated-instance-dal";

type TDedicatedInstanceServiceFactoryDep = {
  dedicatedInstanceDAL: TDedicatedInstanceDALFactory;
  permissionService: TPermissionServiceFactory;
};

interface CreateInstanceParams {
  orgId: string;
  instanceName: string;
  subdomain: string;
  region: string;
  provider: 'aws';
  publiclyAccessible: boolean;
  clusterSize: 'small' | 'medium' | 'large';
  dryRun?: boolean;
}

interface GetInstanceParams {
  orgId: string;
  instanceId: string;
}

interface StackResource {
  resourceType: string;
  resourceStatus: string;
  resourceStatusReason?: string;
}

interface StackEvent {
  timestamp?: Date;
  logicalResourceId?: string;
  resourceType?: string;
  resourceStatus?: string;
  resourceStatusReason?: string;
}

interface InstanceDetails {
  instance: Awaited<ReturnType<TDedicatedInstanceDALFactory["findById"]>>;
  stackStatus?: string;
  stackStatusReason?: string;
  resources?: StackResource[];
  events?: StackEvent[];
}

export type TDedicatedInstanceServiceFactory = ReturnType<typeof dedicatedInstanceServiceFactory>;

const CLUSTER_SIZES = {
  small: {
    containerCpu: 1024,  // 1 vCPU
    containerMemory: 2048,  // 2GB
    rdsInstanceType: 'db.t3.small',
    elasticCacheType: 'cache.t3.micro',
    desiredContainerCount: 1,
    displayName: '1 vCPU, 2GB RAM'
  },
  medium: {
    containerCpu: 2048,  // 2 vCPU
    containerMemory: 4096,  // 4GB
    rdsInstanceType: 'db.t3.medium',
    elasticCacheType: 'cache.t3.small',
    desiredContainerCount: 2,
    displayName: '2 vCPU, 4GB RAM'
  },
  large: {
    containerCpu: 4096,  // 4 vCPU
    containerMemory: 8192,  // 8GB
    rdsInstanceType: 'db.t3.large',
    elasticCacheType: 'cache.t3.medium',
    desiredContainerCount: 4,
    displayName: '4 vCPU, 8GB RAM'
  }
};

export const dedicatedInstanceServiceFactory = ({
  dedicatedInstanceDAL,
  permissionService
}: TDedicatedInstanceServiceFactoryDep) => {
  const listInstances = async ({
    orgId
  }: {
    orgId: string;
  }) => {
    const instances = await dedicatedInstanceDAL.findInstancesByOrgId(orgId);
    return instances;
  };

  const createInstance = async (params: CreateInstanceParams) => {
    const { orgId, instanceName, subdomain, region, publiclyAccessible, dryRun = false, clusterSize = 'small' } = params;

    if (params.provider !== 'aws') {
      throw new BadRequestError({ message: 'Only AWS provider is supported' });
    }

    const clusterConfig = CLUSTER_SIZES[clusterSize];

    // Configure AWS SDK with environment variables
    const awsConfig = {
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
      region: region,
    };

    if (!awsConfig.credentials.accessKeyId || !awsConfig.credentials.secretAccessKey) {
      throw new Error('AWS credentials not found in environment variables');
    }

    const internalTags = {
      'managed-by': 'infisical',
      'organization-id': orgId,
      'instance-name': instanceName
    };

    // Create the instance record with expanded configuration
    const instance = await dedicatedInstanceDAL.create({
      orgId,
      instanceName,
      subdomain,
      status: "PROVISIONING",
      region,
      rdsInstanceType: clusterConfig.rdsInstanceType,
      elasticCacheType: clusterConfig.elasticCacheType,
      elasticContainerMemory: clusterConfig.containerMemory,
      elasticContainerCpu: clusterConfig.containerCpu,
      publiclyAccessible,
      tags: internalTags,
      version: "1.0.0",
      multiAz: true,
      rdsAllocatedStorage: 50,
      rdsBackupRetentionDays: 7,
      redisNumCacheNodes: 1,
      desiredContainerCount: clusterConfig.desiredContainerCount,
      subnetIds: [],
      securityGroupIds: []
    });

    // Generate unique names for resources
    const stackName = `infisical-dedicated-${instance.id}`;
    const dbPassword = randomBytes(32).toString('hex');
    
    // Create CDK app and stack
    const app = new cdk.App();
    const stack = new cdk.Stack(app, stackName, {
      env: { region },
      tags: internalTags,
      synthesizer: new cdk.DefaultStackSynthesizer({
        generateBootstrapVersionRule: false,
      })
    });

    // Create VPC
    const vpc = new ec2.Vpc(stack, `${orgId}-${instanceName}-vpc`, {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // Create RDS instance
    const dbSecurityGroup = new ec2.SecurityGroup(stack, `${orgId}-${instanceName}-db-sg`, {
      vpc,
      description: `Security group for ${instanceName} RDS instance`,
    });

    const db = new rds.DatabaseInstance(stack, `${orgId}-${instanceName}-db`, {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_14,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MEDIUM),
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromPassword(
        'postgres',
        cdk.SecretValue.unsafePlainText(dbPassword)
      ),
      multiAz: true,
      allocatedStorage: 50,
      backupRetention: cdk.Duration.days(7),
    });

    // Create Redis cluster
    const redisSecurityGroup = new ec2.SecurityGroup(stack, `${orgId}-${instanceName}-redis-sg`, {
      vpc,
      description: `Security group for ${instanceName} Redis cluster`,
    });

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(stack, `${orgId}-${instanceName}-redis-subnet`, {
      subnetIds: vpc.privateSubnets.map((subnet: ec2.ISubnet) => subnet.subnetId),
      description: `Subnet group for ${instanceName} Redis cluster`,
    });

    const redis = new elasticache.CfnCacheCluster(stack, `${orgId}-${instanceName}-redis`, {
      engine: 'redis',
      cacheNodeType: 'cache.t3.micro',
      numCacheNodes: 1,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.ref,
    });

    // Create ECS Fargate cluster and service
    const cluster = new ecs.Cluster(stack, `${orgId}-${instanceName}-cluster`, { vpc });

    // Create task execution role with permissions to read from Parameter Store
    const executionRole = new iam.Role(stack, `${orgId}-${instanceName}-execution-role`, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    executionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
    );

    // Create ECS task definition and service
    const taskDefinition = new ecs.FargateTaskDefinition(stack, `${orgId}-${instanceName}-task-def`, {
      memoryLimitMiB: clusterConfig.containerMemory,
      cpu: clusterConfig.containerCpu,
      executionRole,
    });

    taskDefinition.addContainer('infisical', {
      image: ecs.ContainerImage.fromRegistry('infisical/infisical:latest-postgres'),
      environment: {
        NODE_ENV: 'production',
        ENCRYPTION_KEY: randomBytes(16).toString('hex'),
        AUTH_SECRET: randomBytes(32).toString('base64'),
        DB_CONNECTION_URI: `postgresql://postgres:${dbPassword}@${db.instanceEndpoint.hostname}:5432/postgres?sslmode=no-verify`,
        REDIS_URL: `redis://${redis.attrRedisEndpointAddress}:${redis.attrRedisEndpointPort}`,
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: stackName }),
    });

    const service = new ecs.FargateService(stack, `${orgId}-${instanceName}-service`, {
      cluster,
      taskDefinition,
      desiredCount: clusterConfig.desiredContainerCount,
      assignPublicIp: publiclyAccessible,
      vpcSubnets: {
        subnetType: publiclyAccessible ? ec2.SubnetType.PUBLIC : ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
    });

    // Create security group for ECS service
    const ecsSecurityGroup = new ec2.SecurityGroup(stack, `${orgId}-${instanceName}-ecs-sg`, {
      vpc,
      description: `Security group for ${instanceName} ECS service`,
      allowAllOutbound: true,
    });

    // Update service to use the security group
    service.connections.addSecurityGroup(ecsSecurityGroup);

    // Configure security group rules for RDS access
    dbSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow ECS tasks to connect to PostgreSQL'
    );

    // Configure security group rules for Redis access
    redisSecurityGroup.addIngressRule(
      ecsSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow ECS tasks to connect to Redis'
    );

    // Add outputs for resource IDs
    new cdk.CfnOutput(stack, 'vpcid', { value: vpc.vpcId });
    new cdk.CfnOutput(stack, 'publicsubnet1id', { value: vpc.publicSubnets[0].subnetId });
    new cdk.CfnOutput(stack, 'publicsubnet2id', { value: vpc.publicSubnets[1].subnetId });
    new cdk.CfnOutput(stack, 'privatesubnet1id', { value: vpc.privateSubnets[0].subnetId });
    new cdk.CfnOutput(stack, 'privatesubnet2id', { value: vpc.privateSubnets[1].subnetId });
    new cdk.CfnOutput(stack, 'rdsinstanceid', { value: db.instanceIdentifier });
    new cdk.CfnOutput(stack, 'redisclusterid', { value: redis.ref });
    new cdk.CfnOutput(stack, 'ecsclusterarn', { value: cluster.clusterArn });
    new cdk.CfnOutput(stack, 'ecsservicearn', { value: service.serviceArn });
    new cdk.CfnOutput(stack, 'dbsecuritygroupid', { value: dbSecurityGroup.securityGroupId });
    new cdk.CfnOutput(stack, 'redissecuritygroupid', { value: redisSecurityGroup.securityGroupId });

    // After VPC creation, store subnet IDs
    const subnetIds = [
      ...vpc.publicSubnets.map(subnet => subnet.subnetId),
      ...vpc.privateSubnets.map(subnet => subnet.subnetId)
    ];

    // After security group creation, store security group IDs
    const securityGroupIds = [
      dbSecurityGroup.securityGroupId,
      redisSecurityGroup.securityGroupId
    ];

    // Update instance with all infrastructure details
    await dedicatedInstanceDAL.updateById(instance.id, {
      stackName,
      status: "PROVISIONING",
      // Remove the token values and update them after stack creation
      rdsInstanceId: null,
      redisClusterId: null,
      ecsClusterArn: null,
      ecsServiceArn: null,
      vpcId: null,
      subnetIds: null,
      securityGroupIds: null
    });

    // Deploy the stack
    const deployment = app.synth();
    
    if (dryRun) {
      console.log('Dry run - would create stack with template:', JSON.stringify(deployment.getStackArtifact(stackName).template, null, 2));
      return instance;
    }

    // Deploy the CloudFormation stack
    try {
      const cfnClient = new CloudFormationClient(awsConfig);
      const command = new CreateStackCommand({
        StackName: stackName,
        TemplateBody: JSON.stringify(deployment.getStackArtifact(stackName).template),
        Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"],
        Tags: Object.entries(internalTags).map(([Key, Value]) => ({ Key, Value }))
      });

      await cfnClient.send(command);
    } catch (error) {
      await dedicatedInstanceDAL.updateById(instance.id, {
        status: "FAILED",
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      throw error;
    }

    return instance;
  };

  const getInstance = async ({ orgId, instanceId }: GetInstanceParams): Promise<InstanceDetails> => {
    const instance = await dedicatedInstanceDAL.findById(instanceId);
    
    if (!instance) {
      throw new NotFoundError({ message: "Instance not found" });
    }

    if (instance.orgId !== orgId) {
      throw new BadRequestError({ message: "Not authorized to access this instance" });
    }

    // Get CloudFormation stack status
    try {
      const awsConfig = {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
        region: instance.region,
      };

      if (!awsConfig.credentials.accessKeyId || !awsConfig.credentials.secretAccessKey) {
        throw new Error('AWS credentials not found in environment variables');
      }

      const cfnClient = new CloudFormationClient(awsConfig);
      
      // Get stack status
      const stackResponse = await cfnClient.send(new DescribeStacksCommand({
        StackName: instance.stackName
      }));
      const stack = stackResponse.Stacks?.[0];

      if (!stack) {
        return { instance };
      }

      // Get stack events for progress tracking
      const eventsResponse = await cfnClient.send(new DescribeStackEventsCommand({
        StackName: instance.stackName
      }));
      const events = eventsResponse.StackEvents?.map(event => ({
        timestamp: event.Timestamp,
        logicalResourceId: event.LogicalResourceId,
        resourceType: event.ResourceType,
        resourceStatus: event.ResourceStatus,
        resourceStatusReason: event.ResourceStatusReason
      })).sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0)) || [];

      const stackStatus = stack.StackStatus || '';
      let updates: Record<string, any> = {};

      // Process outputs when stack is complete
      if (stackStatus === 'CREATE_COMPLETE') {
        const outputs = stack.Outputs || [];
        const getOutput = (key: string) => outputs.find(o => o.OutputKey?.toLowerCase() === key.toLowerCase())?.OutputValue;

        updates = {
          status: 'RUNNING',
          vpcId: getOutput('vpcid'),
          subnetIds: [
            getOutput('publicsubnet1id'),
            getOutput('publicsubnet2id'),
            getOutput('privatesubnet1id'),
            getOutput('privatesubnet2id')
          ].filter(Boolean) as string[],
          rdsInstanceId: getOutput('rdsinstanceid'),
          redisClusterId: getOutput('redisclusterid'),
          ecsClusterArn: getOutput('ecsclusterarn'),
          ecsServiceArn: getOutput('ecsservicearn'),
          securityGroupIds: [
            getOutput('dbsecuritygroupid'),
            getOutput('redissecuritygroupid')
          ].filter(Boolean) as string[]
        };
      } else if (stackStatus.includes('FAILED')) {
        updates = {
          status: 'FAILED',
          error: stack.StackStatusReason
        };
      }

      // Update instance if we have changes
      if (Object.keys(updates).length > 0) {
        await dedicatedInstanceDAL.updateById(instance.id, updates);
      }

      return {
        instance: {
          ...instance,
          ...updates
        },
        stackStatus: stack.StackStatus,
        stackStatusReason: stack.StackStatusReason,
        events
      };

    } catch (error) {
      // Log the error but don't throw - we still want to return the instance details
      console.error('Error fetching CloudFormation stack status:', error);
    }

    return { instance };
  };

  return {
    listInstances,
    createInstance,
    getInstance
  };
}; 