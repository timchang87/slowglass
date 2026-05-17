#!/usr/bin/env node
import { Tags, App } from 'aws-cdk-lib/core';
import { CoreInfra } from '../lib/core-infra-stack';
import { AWS_ACCOUNT, AWS_REGION } from '../config';

const app = new App();
new CoreInfra(app, 'Staging', {
  env: { account: AWS_ACCOUNT, region: AWS_REGION },
  envName: 'Staging',
});

Tags.of(app).add('Project', 'slowglass');
Tags.of(app).add('ManagedBy', 'cdk');
