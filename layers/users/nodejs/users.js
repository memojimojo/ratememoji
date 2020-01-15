const crypto = require('crypto');

module.exports.userIdFromEmail = (email) =>
    crypto.createHash('sha512').update(email).digest('hex');