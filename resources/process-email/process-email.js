const aws = require('aws-sdk');
const {simpleParser} = require('mailparser');

exports.handler = async function (event, context) {
    const messageId = event.Records[0].ses.mail.messageId;
    const s3 = new aws.S3();

    const stream = await s3.getObject({
        Bucket: process.env.BUCKET_NAME,
        Key: messageId
    }).promise();

    const body = await simpleParser(stream.Body);

    console.log(JSON.stringify(body));
};