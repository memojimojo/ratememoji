# Welcome to your CDK TypeScript project!

![CI](https://github.com/memojimojo/ratememoji-api/workflows/CI/badge.svg)

## Fix Sharp Linux binary

Before running `cdk deploy`:

```shell script
cd resources/process-image
rm -r node_modules/sharp
npm install --arch=x64 --platform=linux sharp --target=12.14.1
```

This is a blank project for TypeScript development with CDK.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
