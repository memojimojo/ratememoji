import cdk = require('@aws-cdk/core');
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
        this.processImage(userBucket);
        this.usersTable(requestUpload);
        this.requestUploadsTokensTable(requestUpload, processEmail);
        this.shareTokensTable(processEmail);
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
            initialPolicy: [
                rekognitionPolicy
            ],
            environment: {
                NO_REPLY_EMAIL: process.env.NO_REPLY_EMAIL!
            }
        });

        bucket.grantRead(processImage);
        bucket.grantPut(processImage);
        bucket.addObjectCreatedNotification(new s3n.LambdaDestination(processImage));
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

    private shareTokensTable(...handlers: lambda.Function[]) {
        const table = new dynamodb.Table(this, 'ShareTokensTable', {
            partitionKey: { name: 'token', type: dynamodb.AttributeType.STRING },
            tableName: 'ShareTokens',
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });
        handlers.map(handler => table.grantReadWriteData(handler));
    }
}