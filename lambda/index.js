'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  signatureVersion: 'v4',
});
const Sharp = require('sharp');

const BUCKET = process.env.BUCKET;
const URL = process.env.URL;
const ALLOWED_DIMENSIONS = new Set();

if (process.env.ALLOWED_DIMENSIONS) {
  const dimensions = process.env.ALLOWED_DIMENSIONS.split(/\s*,\s*/);
  dimensions.forEach((dimension) => ALLOWED_DIMENSIONS.add(dimension));
}

exports.handler = function (event, context, callback) {
  const key = event.queryStringParameters.key;
  const match = key.match(/((\d*)x(\d*))\/(.*)/);
  const dimensions = match[1];
  const size = {
    width: parseInt(match[2] || 0, 10),
    height: parseInt(match[3] || 0, 10)
  };
  const originalKey = match[4];

  if (ALLOWED_DIMENSIONS.size > 0 && !ALLOWED_DIMENSIONS.has(dimensions)) {
    callback(null, {
      statusCode: '403',
      headers: {},
      body: '',
    });
    return;
  }

  const imageResize = (img) => {
    img
      .rotate()
      .toFormat('png')
      .toBuffer()
      .then(buffer => S3.putObject({
        Body: buffer,
        Bucket: BUCKET,
        ContentType: 'image/png',
        Key: key,
      }).promise())
      .then(() => callback(null, {
        statusCode: '301',
        headers: {
          'location': `${URL}/${key}`
        },
        body: '',
      }))
      .catch(err => callback(err))
  };

  S3.getObject({
      Bucket: BUCKET,
      Key: originalKey
    }).promise()
    .then(data => {
      const img = Sharp(data.Body);
      if (size.width && size.height) {
        return imageResize(img.resize(size.width, size.height));
      }
      // resized long
      const resizedLong = Math.round(size.width || size.height || 900);
      return imageResize(img.resize(resizedLong, resizedLong).max());
    })
}
