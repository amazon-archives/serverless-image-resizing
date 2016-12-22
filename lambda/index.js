var AWS = require('aws-sdk');
var S3 = new AWS.S3();
var sharp = require('sharp');
var waterfall = require('async/waterfall');

var bucket = process.env.BUCKET;
var url = process.env.URL;

exports.handler = function(event, context) {
  var key = event.queryStringParameters.key;
  var match = key.match(/(\d+)x(\d+)\/(.*)/);
  var width = parseInt(match[1], 10);
  var height = parseInt(match[2], 10);
  var originalKey = match[3];

  waterfall([
    function(callback) {
      S3.getObject({Bucket: bucket, Key: originalKey}).promise()
        .then((data) => callback(null, data.Body, data.ContentType))
        .catch((err) => callback(err));
    },

    function(buffer, contentType, callback) {
      sharp(buffer)
        .resize(width, height)
        .toBuffer()
        .then((buffer) => callback(null, buffer, contentType))
        .catch((err) => callback(err));
    },

    function(buffer, contentType, callback) {
      var params = {
        Body: buffer,
        Bucket: bucket,
        ContentType: contentType,
        Key: key
      };

      S3.putObject(params).promise()
        .then((data) => callback(null, true))
        .catch((err) => callback(err));
    }
  ], function(err, result) {
    if (!err) {
      context.succeed({
        statusCode: '301',
        headers: {'location': `${url}/${key}`},
        body: ''
      });
    } else {
      context.fail(err);
    }
  });
}
