const sharp = require('sharp');

/**
 * Cf. https://github.com/awslabs/serverless-image-handler/blob/master/source/image-handler/image-handler.js
 */
module.exports = async (originalImage, boundingBox) => {
    const image = sharp(originalImage);
    const metadata = await image.metadata();
    const area = cropArea(boundingBox, metadata);
    image.extract(area);
    return image;
};

function cropArea(boundingBox, metadata) {
    const padding = 10;
    return {
        left: parseInt(boundingBox.Left * metadata.width) - padding,
        top: parseInt(boundingBox.Top * metadata.height) - padding,
        width: parseInt(boundingBox.Width * metadata.width) + 2 * padding,
        height: parseInt(boundingBox.Height * metadata.height) + 2 * padding,
    }
}