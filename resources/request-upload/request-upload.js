const {SES} = require('aws-sdk');
const uuid = require('uuid/v4');

exports.handler = async function (event, context) {
    try {
        if (event.httpMethod === "POST") {
            console.log(process.env.TEMPLATE);
            const json = JSON.parse(event.body);
            if (json.email) {
                // TODO validate e-mail including DNS

                // Generate user id
                const userId = uuid();
                const ses = new SES({apiVersion: '2010-12-01'});
                await ses.sendTemplatedEmail({
                    Destination: {
                        ToAddresses: [json.email]
                    },
                    Source: 'RateMemoji <' + process.env.EMAIL + '>',
                    ReplyToAddresses: [process.env.EMAIL],
                    Template: 'RequestUploadTemplate',
                    TemplateData: JSON.stringify({
                        user_id: userId
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
            statusCode: 400,
            headers: {},
            body: ""
        };
    } catch (error) {
        const body = error.stack || JSON.stringify(error, null, 2);
        return {
            statusCode: 400,
            headers: {},
            body: JSON.stringify(body)
        }
    }
};