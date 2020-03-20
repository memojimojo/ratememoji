const {DynamoDB, S3, SES} = require('aws-sdk');
const {simpleParser} = require('mailparser');
const dynamoDb = new DynamoDB();
const s3 = new S3();
const uuid = require('uuid/v4');
const ses = new SES({apiVersion: '2010-12-01'});

exports.handler = async function (event) {
    const messageId = event.Records[0].ses.mail.messageId;
    const stream = await s3.getObject({
        Bucket: process.env.MAIL_BUCKET,
        Key: messageId
    }).promise();
    const mail = await simpleParser(stream.Body);
    const token = extractRequestUploadToken(mail.html);
    if (token) {
        const userId = await checkUserId(token);
        const attachments = mail.attachments;
        const memoji = attachments.find(it => it.contentType === 'image/png');
        const portrait = attachments.find(it => it.contentType === 'image/jpeg');
        if (userId && memoji && portrait) {
            const assetToken = await generateAssetToken(userId);
            await Promise.all([
                s3.putObject({
                    Bucket: process.env.USER_BUCKET,
                    Key: assetToken + '/memoji.png',
                    Body: memoji.content,
                }).promise(),
                s3.putObject({
                    Bucket: process.env.USER_BUCKET,
                    Key: assetToken + '/raw-portrait.jpg',
                    Body: portrait.content,
                }).promise(),
            ]);
            return confirmUpload(mail.from.value[0].address, userId);
        }
    }
};

function extractRequestUploadToken(mailBody) {
    const matches = mailBody.match(/id: ([0-9a-f-]{36})/);
    if (matches) {
        return matches[1];
    }
}

async function checkUserId(requestUploadToken) {
    return await dynamoDb.deleteItem({
        TableName: 'RequestUploadTokens',
        Key: {token: {S: requestUploadToken}},
        ReturnValues: 'ALL_OLD',
    }).promise()
        .then(user => user.Attributes.userId.S);
}

async function confirmUpload(email, userId) {
    const publishToken = uuid();
    return ses.sendTemplatedEmail({
        Destination: {
            ToAddresses: [email],
        },
        Source: 'RateMemoji <' + process.env.NO_REPLY_EMAIL + '>',
        ReplyToAddresses: [process.env.NO_REPLY_EMAIL],
        Template: 'ConfirmUploadTemplate',
        TemplateData: JSON.stringify({
            share_url: process.env.PUBLIC_URL + '/share/' + await share(userId),
            public_url: process.env.PUBLIC_URL + '/publish/' + publishToken,
        }),
    }).promise();
}

async function generateAssetToken(userId) {
    const assetToken = uuid();
    await Promise.all([
        dynamoDb.putItem({
            TableName: 'AssetTokens',
            Item: {
                token: {S: assetToken},
                userId: {S: userId},
            }
        }).promise(),
        dynamoDb.updateItem({
            TableName: 'Users',
            Key: {id: {S: userId}},
            UpdateExpression: 'set assetToken = :assetToken',
            ExpressionAttributeValues: {
                ':assetToken': {S: assetToken},
            },
        }).promise(),
    ]);
    return assetToken;
}

async function share(userId) {
    const shareToken = uuid();
    await dynamoDb.putItem({
        TableName: 'ShareTokens',
        Item: {
            token: {S: shareToken},
            userId: {S: userId},
        }
    }).promise();
    return shareToken;
}
