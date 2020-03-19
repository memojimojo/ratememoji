import cdk = require('@aws-cdk/core');
import codebuild = require('@aws-cdk/aws-codebuild');
import dynamodb = require('@aws-cdk/aws-dynamodb');
import fs = require('fs');
import lambda = require('@aws-cdk/aws-lambda');
import path = require('path');
import apigateway = require('@aws-cdk/aws-apigateway');
import iam = require('@aws-cdk/aws-iam');
import ses = require('@aws-cdk/aws-ses');
import sesactions = require('@aws-cdk/aws-ses-actions');
import s3 = require('@aws-cdk/aws-s3');
import s3n = require('@aws-cdk/aws-s3-notifications');
import {RestApi} from "@aws-cdk/aws-apigateway";
import {LayerVersion} from "@aws-cdk/aws-lambda";
import {LocalCacheMode} from "@aws-cdk/aws-codebuild";
import {CloudFrontWebDistribution, OriginAccessIdentity} from "@aws-cdk/aws-cloudfront";

require('dotenv').config();

export class ApiStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const usersLayer = new lambda.LayerVersion(this, 'UsersLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../layers/users')),
        });
        const mailBucket = new s3.Bucket(this, 'EmailBucket');
        const userBucket = new s3.Bucket(this, 'UserBucket');

        const processEmail = this.processEmail(mailBucket, userBucket, usersLayer);

        const api = new apigateway.RestApi(this, 'Gateway', {
            restApiName: 'RateMemoji API'
        });

        new ses.ReceiptRuleSet(this, 'RuleSet', {
            rules: [
                {
                    recipients: [process.env.EMAIL!],
                    actions: [
                        new sesactions.S3({
                            bucket: mailBucket,
                        }),
                        new sesactions.Lambda({
                            function: processEmail,
                        }),
                    ]
                }
            ]
        });

        const requestUpload = this.requestUpload(api, usersLayer);
        const userAssetsUrl = this.cloudFront(userBucket);
        const getSharedPair = this.getSharedPair(api, userAssetsUrl);
        this.processImage(userBucket);
        this.usersTable(requestUpload, processEmail, getSharedPair);
        this.requestUploadsTokensTable(requestUpload, processEmail);
        this.assetTokensTable(processEmail);
        this.shareTokensTable(processEmail, getSharedPair);
        this.codeBuild();
    }

    private requestUpload(api: RestApi, ...layers: LayerVersion[]) {
        new ses.CfnTemplate(this, 'RequestUploadTemplate', {
            template: {
                templateName: 'RequestUploadTemplate',
                htmlPart: fs.readFileSync(__dirname + '/emails/RequestUploadTemplate.html').toString(),
                subjectPart: "Welcome to RateMemoji"
            },
        });
        const requestUpload = new lambda.Function(this, 'RequestUpload', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../resources/request-upload')),
            handler: 'request-upload.handler',
            runtime: lambda.Runtime.NODEJS_12_X,
            layers: layers,
            environment: {
                EMAIL: process.env.EMAIL!
            },
            initialPolicy: [
                new iam.PolicyStatement({
                    resources: ['*'],
                    actions: [
                        'ses:SendTemplatedEmail'
                    ]
                })

            ]
        });
        const uploadRequests = api.root.addResource('upload-requests');
        uploadRequests.addMethod('POST', new apigateway.LambdaIntegration(requestUpload));

        return requestUpload;
    }

    private processEmail(mailBucket: s3.Bucket, userBucket: s3.Bucket, ...layers: LayerVersion[]) {
        new ses.CfnTemplate(this, 'ConfirmUploadTemplate', {
            template: {
                templateName: 'ConfirmUploadTemplate',
                htmlPart: fs.readFileSync(__dirname + '/emails/ConfirmUploadTemplate.html').toString(),
                subjectPart: "Your Memoji is a go!"
            },
        });

        const handler = new lambda.Function(this, 'ProcessEmail', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../resources/process-email')),
            handler: 'process-email.handler',
            runtime: lambda.Runtime.NODEJS_12_X,
            layers: layers,
            timeout: cdk.Duration.seconds(10),
            environment: {
                MAIL_BUCKET: mailBucket.bucketName,
                USER_BUCKET: userBucket.bucketName,
                NO_REPLY_EMAIL: process.env.NO_REPLY_EMAIL!,
                PUBLIC_URL: process.env.PUBLIC_URL!,
            },
            initialPolicy: [
                new iam.PolicyStatement({
                    resources: ['*'],
                    actions: [
                        'ses:SendTemplatedEmail'
                    ]
                })
            ]
        });
        mailBucket.grantRead(handler);
        userBucket.grantPut(handler);
        return handler;
    }

    private processImage(bucket: s3.Bucket) {
        const rekognitionPolicy = new iam.PolicyStatement({
            resources: ['*'],
            actions: [
                'rekognition:*',
            ]
        });

        const processImage = new lambda.Function(this, 'ProcessImage', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../resources/process-image')),
            handler: 'process-image.handler',
            runtime: lambda.Runtime.NODEJS_12_X,
            timeout: cdk.Duration.seconds(10),
            initialPolicy: [
                rekognitionPolicy
            ],
            environment: {
                NO_REPLY_EMAIL: process.env.NO_REPLY_EMAIL!
            }
        });

        bucket.grantRead(processImage);
        bucket.grantPut(processImage);
        bucket.addObjectCreatedNotification(new s3n.LambdaDestination(processImage), {
            suffix: 'raw-portrait.jpg',
        });
        bucket.addObjectCreatedNotification(new s3n.LambdaDestination(processImage), {
            suffix: 'memoji.png',
        });
    }

    private getSharedPair(api: RestApi, assetsUrl: string) {
        const handler = new lambda.Function(this, 'GetSharedPair', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../resources/get-shared-pair')),
            handler: 'get-shared-pair.handler',
            runtime: lambda.Runtime.NODEJS_12_X,
            environment: {
                ASSETS_URL: assetsUrl
            },
        });
        const resource = api.root.addResource('shares');
        const sharedPair = resource.addResource('{token}');
        sharedPair.addMethod('GET', new apigateway.LambdaIntegration(handler));
        return handler;
    }

    private usersTable(...handlers: lambda.Function[]) {
        const table = new dynamodb.Table(this, 'UsersTable', {
            partitionKey: {name: 'id', type: dynamodb.AttributeType.STRING},
            tableName: 'Users',
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });
        handlers.map(handler => table.grantReadWriteData(handler));
    }

    private requestUploadsTokensTable(...handlers: lambda.Function[]) {
        const table = new dynamodb.Table(this, 'RequestUploadTokensTable', {
            partitionKey: { name: 'token', type: dynamodb.AttributeType.STRING },
            tableName: 'RequestUploadTokens',
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });
        handlers.map(handler => table.grantReadWriteData(handler));
    }

    private assetTokensTable(...handlers: lambda.Function[]) {
        const table = new dynamodb.Table(this, 'AssetTokensTable', {
            tableName: 'AssetTokens',
            partitionKey: {name: 'token', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });
        handlers.map(handler => table.grantReadWriteData(handler));
    }

    private shareTokensTable(...handlers: lambda.Function[]) {
        const table = new dynamodb.Table(this, 'ShareTokensTable', {
            partitionKey: { name: 'token', type: dynamodb.AttributeType.STRING },
            tableName: 'ShareTokens',
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });
        handlers.map(handler => table.grantReadWriteData(handler));
    }

    private cloudFront(bucket: s3.Bucket) {
        const oai = new OriginAccessIdentity(this, 'CloudFront');
        bucket.grantRead(oai);
        const distribution = new CloudFrontWebDistribution(this, 'UserUploads', {
            originConfigs: [
                {
                    s3OriginSource: {
                        s3BucketSource: bucket,
                        originAccessIdentity: oai,
                    },
                    behaviors: [{isDefaultBehavior: true}]
                }
            ]
        });
        return 'https://' + distribution.domainName;
    }

    private codeBuild() {
        new codebuild.Project(this, 'RateMemojiApiBuild', {
            projectName: 'RateMemojiApiBuild',
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: 'npm install'
                    },
                    build: {
                        commands: [
                            'npm run build',
                            'npm run cdk deploy -- --require-approval never',
                        ]
                    }
                },
            }),
            cache: codebuild.Cache.local(LocalCacheMode.DOCKER_LAYER),
        });
    }
}
