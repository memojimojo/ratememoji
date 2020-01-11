const {Rekognition} = require('aws-sdk');
const client = new Rekognition();

module.exports = async function detectFace(s3Object) {
    const faces = await client.detectFaces({
        Image: {
            S3Object: s3Object
        }
    }).promise();

    if (faces.FaceDetails.length > 0) {
        return faces.FaceDetails[0].BoundingBox
    }
};