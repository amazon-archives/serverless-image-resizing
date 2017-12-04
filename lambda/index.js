'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({signatureVersion: 'v4'});
const Sharp = require('sharp');
const BUCKET = process.env.BUCKET;
const URL = process.env.URL;

function imageWorker(event, context, callback) {
  let key = event.queryStringParameters.key;

  // If we don't have key, that contain path to image, then we can't continue
  if (key === undefined) {
    return callback(null, {
      statusCode: '400',
      body: JSON.stringify({error: 'Key does not exists.'}),
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  const match = key.match(/((\d+)x?(\d+)?\/)?(.+\.(png|PNG|jpg|JPG|jpeg|JPEG|tif|TIF|tiff|TIFF|webp|WEBP))/);

  if (match === null) {
    // URL don't match regexp
    return callback(null, {
      statusCode: '400',
      body: JSON.stringify({ error: 'Key does not match form: Nx?N?/name.[jpeg|jpg|png|tiff|webp]. Not supported image format.' }),
      headers: {
      'Content-Type': 'application/json'
      }
    });
  }
  
  const url = require('url');
  const supportWebP = (event.headers.Accept.indexOf('webp') > -1);
  const parsedURL = url.parse(event.queryStringParameters.key, true, true);
  const originalKey = match[4];
  const extension = match[5];
  
  // If browser support webp — redirect to webp
  if (supportWebP && extension !== 'webp') {
    const extensionFix = RegExp(/.(jpeg|jpg|png|tiff|webp)/,'ig');
    key = key.replace(extensionFix, '.webp');
  }

  // Let get metadata by key
  S3.headObject({Bucket: BUCKET, Key: originalKey}, function(err, data) {

    if (err) {
      // Can't find this file
      return callback(null, {
        statusCode: '404',
        body: JSON.stringify({error: 'Key does not exists.'}),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    
    S3.getObject({Bucket: BUCKET, Key: originalKey}).promise().then((data) => {
      let image = Sharp(data.Body);
      return image.metadata().then((metadata) => {

        // Let's calculate image size
        // 0 minimal
        // 5000 maximal
        // But no upscale
        // Aspect ratio maintained
        let width = parsedURL.query.width
          ? parsedURL.query.width
          : (match[2] === undefined)
            ? metadata.width 
            : parseInt(match[2], 10);
        let height = parsedURL.query.height
          ? parsedURL.query.height
          : (match[3] === undefined)
            ? null
            : parseInt(match[3], 10);

        let isHeight = (height !== null);
        let ratio = isHeight
          ? width / height
          : metadata.width / metadata.height;
        let targetWidth = Math.floor(Math.max(0, Math.min(Math.min(parseInt(width, 10), metadata.width), 5000)));
        let targetHeight = Math.floor(Math.max(0, Math.min(targetWidth / ratio, 5000)));

        if (supportWebP) {
          return image
            .resize(targetWidth, targetHeight)
            .crop(Sharp.gravity.north)
            .webp({
              quality: 75, 
              force: true
            })
            .toBuffer();
        }
        
        return image
          .resize(targetWidth, targetHeight)
          .crop(Sharp.gravity.north)
          .jpeg({
            quality: 75, 
            chromaSubsampling: '4:4:4'
          })
          .toBuffer();

      });
    }).then(buffer => S3.putObject({
      Body: buffer,
      Bucket: BUCKET,
      ContentType: supportWebP ? 'image/webp' : 'image/jpeg',
      Key: key,
      Tagging: "resized=true"
    }).promise()).then(() => callback(null, {
      statusCode: '301',
      headers: {
        'location': `${URL}/${key}`
      },
      body: ''
    })).catch(err => callback(err));
  });
}

exports.handler = imageWorker;