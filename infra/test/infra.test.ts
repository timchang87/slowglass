import { beforeAll, describe, test, expect } from 'vitest';
import { App, Stack } from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import * as Infra from '../lib/core-infra-stack';

describe('Core Infrastructure', () => {
  let template: Template;
  let stack: Stack;

  beforeAll(() => {
    const app = new App();
    stack = new Infra.CoreInfra(app, 'MyTestStack', { envName: 'Test' });
    template = Template.fromStack(stack);
  });

  test('Throw error when envName is empty', () => {
    const app = new App();
    expect(
      () => new Infra.CoreInfra(app, 'MyUnhappyTestStack', { envName: '' }),
    );
  });

  test('VPC is created', () => {
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/24',
      EnableDnsHostnames: true,
      EnableDnsSupport: true,
    });
  });

  test('All subnets are created', () => {
    const subnets = template.findResources('AWS::EC2::Subnet');
    expect(Object.keys(subnets)).toHaveLength(2);
  });

  test('Private subnet is created', () => {
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: '10.0.0.0/27',
      MapPublicIpOnLaunch: false,
      // AvailabilityZone: 'us-east-1a',
    });
  });

  test('Public subnet is created', () => {
    template.hasResourceProperties('AWS::EC2::Subnet', {
      CidrBlock: '10.0.0.32/27',
      MapPublicIpOnLaunch: true,
      // AvailabilityZone: 'us-east-1a',
    });
  });
});
