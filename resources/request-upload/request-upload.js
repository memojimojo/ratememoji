const {userIdFromEmail} = require('/opt/nodejs/users');
const {DynamoDB, SES} = require('aws-sdk');
const uuid = require('uuid/v4');
const dynamoDb = new DynamoDB();
const ses = new SES({apiVersion: '2010-12-01'});

exports.handler = async function (event) {
    try {
        if (event.httpMethod === "POST") {
            const json = JSON.parse(event.body);
            if (json.email) {
                // TODO validate e-mail including DNS

                const userId = userIdFromEmail(json.email);
                const requestUploadToken = uuid();
                await Promise.all([
                    await dynamoDb.putItem({
                        TableName: 'Users',
                        Item: {
                            id: {S: userId}
                        }
                    }).promise(),
                    await dynamoDb.putItem({
                        TableName: 'RequestUploadTokens',
                        Item: {
                            token: {S: requestUploadToken},
                            userId: {S: userId}
                        }
                    }).promise()
                ]);

                await ses.sendTemplatedEmail({
                    Destination: {
                        ToAddresses: [json.email]
                    },
                    Source: 'RateMemoji <' + process.env.EMAIL + '>',
                    ReplyToAddresses: [process.env.EMAIL],
                    Template: 'RequestUploadTemplate',
                    TemplateData: JSON.stringify({
                        token: requestUploadToken
                    }),
                })
                    .promise()
                    .then(
                        (data) => console.log(data)
                    )
                    .catch((err) => console.log(err))
            }

            return {
                statusCode: 200,
                headers: {}
            };
        }

        return {
            statusCode: 400
        };
    } catch (error) {
        const body = error.stack || JSON.stringify(error, null, 2);
        return {
            statusCode: 400,
            body: JSON.stringify(body)
        }
    }
};