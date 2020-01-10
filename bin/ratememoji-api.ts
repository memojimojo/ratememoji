#!/usr/bin/env node
import 'source-map-support/register';
import {RateMemoji} from '../lib/ratememoji';
import cdk = require('@aws-cdk/core');

const app = new cdk.App();
new RateMemoji(app, 'RateMemoji', {
    env: {
        account: process.env.ACCOUNT_ID,
        region: process.env.REGION
    }
});
