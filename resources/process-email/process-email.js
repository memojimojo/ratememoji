const aws = require('aws-sdk');
const {simpleParser} = require('mailparser');

exports.handler = async function (event, context) {
    const messageId = event.Records[0].ses.mail.messageId;
    const s3 = new aws.S3();

    const stream = await s3.getObject({
        Bucket: process.env.MAIL_BUCKET,
        Key: messageId
    }).promise();
    const mail = await simpleParser(stream.Body);
    const userId = mail.subject;
    const attachments = mail.attachments;
    const memoji = attachments.find(it => it.contentType === 'image/png');
    const profile = attachments.find(it => it.contentType === 'image/jpeg');
    if (memoji && profile) {
        await Promise.all([
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
};