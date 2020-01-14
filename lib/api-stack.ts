import cdk = require('@aws-cdk/core');
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

export class ApiStack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const mailBucket = new s3.Bucket(this, 'EmailBucket');
        const userBucket = new s3.Bucket(this, 'UserBucket');

        const processEmail = new lambda.Function(this, 'ProcessEmail', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../resources/process-email')),
            handler: 'process-email.handler',
            runtime: lambda.Runtime.NODEJS_12_X,
            timeout: cdk.Duration.seconds(10),
            environment: {
                MAIL_BUCKET: mailBucket.bucketName,
                USER_BUCKET: userBucket.bucketName,
            }
        });

        mailBucket.grantRead(processEmail);
        userBucket.grantPut(processEmail);

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

        const usersLayer = new lambda.LayerVersion(this, 'Users', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../layers/users')),
        });

        this.requestUpload(api, usersLayer);
        this.processImage(userBucket);
    }

    private async requestUpload(api: RestApi, ...layers: LayerVersion[]) {
        new ses.CfnTemplate(this, 'RequestUploadTemplate', {
            template: {
                templateName: 'RequestUploadTemplate',
                htmlPart: 'Hey! Welcome to RateMemoji. Please reply to this e-mail and attach both your Memoji and a photo of your face.<br><br>' +
                    'Make sure to keep the line below:<br><br>' +
                    'id: {{user_id}}',
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
            ]
        });

        bucket.grantRead(processImage);
        bucket.grantPut(processImage);
        bucket.addObjectCreatedNotification(new s3n.LambdaDestination(processImage));
    }
}