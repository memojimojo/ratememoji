const AWS = require('aws-sdk');

exports.handler = async function (event, context) {
    try {
        if (event.httpMethod === "POST") {
            const json = JSON.parse(event.body);
            if (json.email) {
                // TODO validate e-mail including DNS

                new AWS.SES({apiVersion: '2010-12-01'})
                    .sendTemplatedEmail({
                        Destination: {
                            ToAddresses: [json.email]
                        },
                        Source: 'doreply@ratememoji.com',
                        ReplyToAddresses: ['doreply@ratememoji.com'],
                        Template: 'TEMPLATE_NAME',
                        TemplateData: JSON.stringify({BLI: "BLA"}),
                    })
                    .promise()
                    .then(
                        (data) => console.log(data)
                    )
                    .catch((err) => console.log(err))
            }

            return {
                statusCode: 200,
                headers: {},
                body: JSON.stringify(body)
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