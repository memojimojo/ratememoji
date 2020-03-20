const {DynamoDB} = require('aws-sdk');
const dynamoDb = new DynamoDB();

exports.handler = async function (event) {
    try {
        if (event.httpMethod === 'GET') {
            const token = event.pathParameters.token;
            const userId = await dynamoDb.getItem({
                TableName: 'ShareTokens',
                Key: {token: {S: token}},
            }).promise()
                .then(share => share.Item.userId.S);

            if (userId) {
                const assetId = await dynamoDb.getItem({
                    TableName: 'Users',
                    Key: {id: {S: userId}},
                }).promise()
                    .then(user => user.Item.assetToken.S);

                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        portrait_url: process.env.ASSETS_URL + '/' + assetId + '/portrait.jpg',
                        memoji_url: process.env.ASSETS_URL + '/' + assetId + '/memoji.png',
                    }),
                };
            }
        }

        return {
            statusCode: 400,
        };
    } catch (error) {
        const body = error.stack || JSON.stringify(error);
        return {
            statusCode: 400,
            body: JSON.stringify(body)
        }
    }
};