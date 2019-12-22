import cdk = require('@aws-cdk/core');
import {ApiStack} from "./api-stack";

export interface RateMemojiProps extends cdk.StackProps {}

export class RateMemoji extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props?: RateMemojiProps) {
    super(scope, id);
    new ApiStack(this, 'Api', props)
  }
}
