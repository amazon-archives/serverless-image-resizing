'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  signatureVersion: 'v4',
});
const Sharp = require('sharp');

const BUCKET = process.env.BUCKET;
const URL = process.env.URL;

exports.handler = function(event, context, callback) {
  const key = event.queryStringParameters.key;
  if(key === undefined){
    return callback(null, {
        statusCode: '400',
        body: JSON.stringify({ error: 'Key does not exists.' }),
        headers: {
        'Content-Type': 'application/json'
        }
      })
  }
  const match = key.match(/(\d+)x?(\d+)?\/(.+\.(png|PNG|jpg|JPG|jpeg|JPEG|tif|TIF|tiff|TIFF|webp|WEBP))/);
  if(match === null){
    S3.headObject({Bucket: BUCKET, Key: key}, function(err, data) {
      if(err){
        return callback(null, {
            statusCode: '404',
            body: JSON.stringify({ error: 'Key does not exists.' }),
            headers: {
            'Content-Type': 'application/json'
            }
          })
      }else {
        return callback(null, {
            statusCode: '400',
            body: JSON.stringify({ error: 'Key does not match form: Nx?N?/name.[jpeg|jpg|png|tiff|webp]. Not supported image format.' }),
            headers: {
            'Content-Type': 'application/json'
            }
          })
      }
    })

  }else {
    const originalKey = match[3];
    S3.headObject({Bucket: BUCKET, Key: originalKey}, function(err, data) {
      if(err){
        return callback(null, {
            statusCode: '404',
            body: JSON.stringify({ error: 'Key does not exists.' }),
            headers: {
            'Content-Type': 'application/json'
            }
          })
        }else{
          let height = 0;
          const width = parseInt(match[1], 10);
          if(match[2] === undefined){
            height = parseInt(match[1], 10);
          }else {
            height = parseInt(match[2], 10);
          }
          const maxPixelCount = 5000;
          const minPixelCount = 0;
          if(width <= minPixelCount || width > maxPixelCount || height <= minPixelCount || height > maxPixelCount) {
            return callback(null, {
              statusCode: '400',
              body: JSON.stringify({ error: `Image requested is not in range ${minPixelCount+=1}-${maxPixelCount} pixels.` }),
              headers: {
                'Content-Type': 'application/json'
              }
            })
          }

          if(match[2] === undefined) {
              height = null;
          }

          S3.getObject({Bucket: BUCKET, Key: originalKey}).promise()
          .then(data => Sharp(data.Body)
          .resize(width, height)
          .crop(Sharp.gravity.north)
          .toFormat('jpeg')
          .toBuffer()
        )
        .then(buffer => S3.putObject({
          Body: buffer,
          Bucket: BUCKET,
          ContentType: 'image/jpeg',
          Key: key,
          Tagging: "resized=true"
        }).promise()
      )
      .then(() => callback(null, {
        statusCode: '301',
        headers: {'location': `${URL}/${key}`},
        body: ''
      })
    )
    .catch(err => callback(err))
        }
    })

  }
}
