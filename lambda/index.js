var AWS = require('aws-sdk');
var S3 = new AWS.S3();
var Sharp = require('sharp');

var BUCKET = process.env.BUCKET;
var URL = process.env.URL;

exports.handler = function(event, context) {
  var key = event.queryStringParameters.key;
  var match = key.match(/(\d+)x(\d+)\/(.*)/);
  var width = parseInt(match[1], 10);
  var height = parseInt(match[2], 10);
  var originalKey = match[3];

  S3.getObject({Bucket: BUCKET, Key: originalKey}).promise()
    .then((data) => Sharp(data.Body)
        .resize(width, height)
        .toFormat('png')
        .toBuffer()
    )
    .then((buffer) => S3.putObject({
        Body: buffer,
        Bucket: BUCKET,
        ContentType: 'image/png',
        Key: key
      }).promise()
    )
    .then(() => context.succeed({
        statusCode: '301',
        headers: {'location': `${URL}/${key}`},
        body: ''
      })
    )
    .catch((err) => context.fail(err))
}
