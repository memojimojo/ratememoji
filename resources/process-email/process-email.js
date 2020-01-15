const {S3, DynamoDB} = require('aws-sdk');
const {simpleParser} = require('mailparser');
const dynamoDb = new DynamoDB();
const s3 = new S3();

exports.handler = async function (event) {
    const messageId = event.Records[0].ses.mail.messageId;
    const stream = await s3.getObject({
        Bucket: process.env.MAIL_BUCKET,
        Key: messageId
    }).promise();
    const mail = await simpleParser(stream.Body);
    const token = extractRequestUploadToken(mail.html);
    if (token) {
        const userId = await findUserId(token);
        const attachments = mail.attachments;
        const memoji = attachments.find(it => it.contentType === 'image/png');
        const profile = attachments.find(it => it.contentType === 'image/jpeg');
        if (userId && memoji && profile) {
            return Promise.all([
                s3.putObject({
                    Bucket: process.env.USER_BUCKET,
                    Key: userId + '/memoji.png',
                    Body: memoji.content,
                }).promise(),
                s3.putObject({
                    Bucket: process.env.USER_BUCKET,
                    Key: userId + '/profile.jpg',
                    Body: profile.content,
                }).promise(),
            ])
        }
    }
};

function extractRequestUploadToken(mailBody) {
    const matches = mailBody.match(/id: ([0-9a-f-]{36})/);
    if (matches) {
        return matches[1];
    }
}

async function findUserId(requestUploadToken) {
    return await dynamoDb.getItem({
        TableName: 'RequestUploadTokens',
        Key: {token: {S: requestUploadToken}}
    }).promise()
        .then(user => user.Item.userId.S);
}