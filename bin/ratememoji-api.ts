#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { RatememojiApiStack } from '../lib/ratememoji-api-stack';

const app = new cdk.App();
new RatememojiApiStack(app, 'RatememojiApiStack');
