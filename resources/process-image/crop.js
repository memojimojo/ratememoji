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
    const horizontalPadding = boundingBox.Width * metadata.width * 0.2;
    const verticalPadding = boundingBox.Height * metadata.height * 0.2;

    return {
        left: parseInt(boundingBox.Left * metadata.width - horizontalPadding) ,
        top: parseInt(boundingBox.Top * metadata.height - verticalPadding),
        width: parseInt(boundingBox.Width * metadata.width + 2 * horizontalPadding),
        height: parseInt(boundingBox.Height * metadata.height + 2 * verticalPadding),
    }
}
