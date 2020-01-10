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
    const acceptableMimeTypes = [
        'image/jpeg',
        'image/png',
    ];
    const attachments = mail.attachments.filter(attachment => acceptableMimeTypes.includes(attachment.contentType));
    if (attachments.length === 2) {
        await Promise.all([
            s3.putObject({
                Bucket: process.env.USER_BUCKET,
                Key: userId + '/memoji.png',
                Body: attachments[0].content,
            }).promise(),
            s3.putObject({
                Bucket: process.env.USER_BUCKET,
                Key: userId + '/profile.jpg',
                Body: attachments[1].content,
            }).promise(),
        ])
    }
    console.log(JSON.stringify(mail));
};