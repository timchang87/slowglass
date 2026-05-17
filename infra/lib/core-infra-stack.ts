import { Stack, StackProps, Tags } from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { Vpc, IpAddresses, NatProvider, SubnetType } from 'aws-cdk-lib/aws-ec2';

interface CoreInfraProps extends StackProps {
  envName: string;
}

export class CoreInfra extends Stack {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props: CoreInfraProps) {
    super(scope, id, props);

    const { envName } = props;

    Tags.of(this).add('Environment', envName);

    this.vpc = new Vpc(this, 'CoreVPC', {
      ipAddresses: IpAddresses.cidr('10.0.0.0/24'),
      vpcName: `${envName}VPC`,
      createInternetGateway: true,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      maxAzs: 1,
      natGateways: 1,
      natGatewayProvider: NatProvider.gateway(),
      restrictDefaultSecurityGroup: false,
      subnetConfiguration: [
        {
          cidrMask: 27,
          name: 'PrivateCore',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 27,
          name: 'PublicCore',
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });
  }
}
