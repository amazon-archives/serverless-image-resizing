'use strict';

const AWSXRay = require('aws-xray-sdk-core');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));
const S3 = new AWS.S3();
const Sharp = require('sharp');
const logger = require('winston');

AWSXRay.setLogger(logger);

// These need to be defined in AWS with the Lambda
const SRC_BUCKET = process.env.SRC_BUCKET;
const ORIG_SRC_BUCKET = process.env.ORIG_SRC_BUCKET;
const DST_BUCKET = process.env.DST_BUCKET;
const URL = process.env.URL;

logger.log('info', 'Redirect URL', URL);
logger.log('info', 'SRC_BUCKET', SRC_BUCKET);
logger.log('info', 'ORIG_SRC_BUCKET', ORIG_SRC_BUCKET);
logger.log('info', 'DST_BUCKET', DST_BUCKET);

// JSON file generated from the "liip_imagine -> filter_sets" section of
// neighbourly/app/config.yml file.
//
// This is generated via the neighbourly:create-serverless-image-resizing-config Neighbourly symfony command
// ALSO see the ansible playbook build-serverless-image-resizing which generates and copies the file in place (among building this whole module)
var filterSet = require('./liip_imagine_filter_sets.json');


// Implement a subset of the Liip Imagine filters
// (only the ones that appear in the config)
//
// Image manipulation via Sharp NPM image library
// http://sharp.dimens.io/en/stable/
//
// If you add different kinds of filters or parameters to that config
// you may need to modify this function to support them
var Resize = function (imgData, filterSet) {

  const filters = filterSet.filters;
  var imageFormat;
  var jpegOptions = {};
  var outputOptions = {};
  var upscale = false;
  var upscaleX, upscaleY;
  var img = Sharp(imgData);

  // The conversion from YAML to JSON loses ordering of filters
  // so we'll make some assumptions about sequence.

  // upscale
  // Preserving aspect ratio, resize the image to be as small as possible
  // while ensuring its dimensions are greater than or equal to the
  // width and height specified
  if (filters.hasOwnProperty('upscale')) {

    var u = filters.upscale;

    // Note: in Sharp, multiple resizsings can't be done as discrete
    // operations without creating multiple buffers, so instead we flag here
    // whether upscaling should be done as part of thumbnail creation later
    if (u.hasOwnProperty('min') &&
      Array.isArray(u.min) &&
      u.min.length == 2) {
      upscale = true;
      upscaleX = u.min[0];
      upscaleY = u.min[1];
      // console.log("Upscale to " + u.min[0] + " x " + u.min[1])
    }
  }

  // thumbnail
  // 'inset' mode : fit within dimensions, preserving aspect ratio
  //
  // 'outbound' mode : resize the image to be as small as possible
  // while ensuring its dimensions are greater than or equal to
  // specified dimensions, then crop (center focused) to exact dimensions.
  if (filters.hasOwnProperty('thumbnail')) {

    var f = filters.thumbnail;
    var enlarge = false;

    if (f.hasOwnProperty('size') &&
      f.hasOwnProperty('mode') &&
      Array.isArray(f.size) &&
      f.size.length == 2) {

      // decide if we actually need to upscale
      if (upscale && (upscaleX >= f.size[0] || upscaleY >= f.size[1])) {
        enlarge = true;
      }

      img = img.resize(f.size[0], f.size[1]);

      if (!enlarge) {
        img = img.withoutEnlargement();
      }

      if (f.mode === "inset") {
        img = img.max();
      }

      // console.log("Thumbnail to " + f.size[0] + " x " + f.size[1] + " (" + f.mode + ")");
    }
  }

  // relative_resize
  //
  // scale the image to the width specified, maintaining aspect
  // ratio for the height.
  if (filters.hasOwnProperty('relative_resize')) {

    var r = filters.relative_resize;

    if (r.hasOwnProperty('widen')) {
      img = img.resize(r.widen, null).withoutEnlargement();
      // console.log("Widening to " + r.widen);
    }
  }

  // jpegs may have optional quality setting
  if (filterSet.hasOwnProperty('quality')) {
    jpegOptions = { quality: filterSet.Quality };
  }


  return img.metadata()
    .then(metadata => {
      if(metadata.format == 'gif') {
        // GIF is not a Sharp supported output format, so
        // we have to kinda cheat. Set the output format and the mimeType
        // to PNG, but keep the actual filename with the GIF extension
        imageFormat = 'png';
        console.log("GIF not supported - outputting as PNG (but keeping original filename)");
      } else {
        imageFormat = metadata.format;
      }

      // JPEGs have additional settings for quality
      if (imageFormat === "jpeg") {
        outputOptions = jpegOptions;
      }

      return img.toFormat(imageFormat, outputOptions)
        .toBuffer()
        .then(buffer => {
          return { data: buffer, mimeType: "image/" + imageFormat }
        })
    })
}

//
// Some source files have either a default or explicitly incorrect
// Mime Type associated with them, which because a problem when serving the files
// directly from the S3 bucket via Cloudfront.
//
// Notable example is all the images in event_images/ have a MimeType of 'application/octet-stream'
// (perhaps due to some bug while upoading?)
//
// This is only an issue with images that are not scaled (and other files), as we
// determine the MimeType programatically for images that are opened and manipulated
// via the sharp library.

var getCorrectMimeType = function (filename, mimeType) {
  // Only concerned with "application/octet-stream" and
  // "binary/octet-stream" for now
  if (mimeType.substr(mimeType.length - 12) !== "octet-stream") {
    return mimeType;
  }

  var newMimeType = mimeType
  var ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      newMimeType = 'image/jpeg';
      break;

    case 'png':
      newMimeType = 'image/png';
      break;

    case 'gif':
      newMimeType = 'image/gif';
      break;

    case 'pdf':
      newMimeType = 'application/pdf';
      break;
  }

  if (mimeType !== newMimeType) {
    console.log("Invalid Mime Type '%s' found for '%s'. Corrected it to '%s'.", mimeType, filename, newMimeType)
  } else {
    console.log("Invalid Mime Type '%s' found for '%s'. However, didn't fix it as we don't have a rule for '%s' file extensions." , mimeType, filename, ext)
  }

  return newMimeType;
}

const ResizeAndCopy = function (path, context, callback) {
  logger.log('info', 'filterSet', filterSet);

  const pieces = path.toString().split('/');

  logger.log('info', 'patch pieces', pieces);

  // Valid paths will look something like
  // images/cache/_filter_type_/_collection_/_filename_._filetype_?_optional_cachebuster_

  if (pieces.length < 4 ||
    pieces[0] !== 'images' ||
    pieces[1] !== 'cache' ||
    !filterSet.hasOwnProperty(pieces[2])) {
    // Send generic 404 to client for clearly invalid paths
    console.log("Invalid path format for image specified : " + path)
    callback(null, {
      statusCode: '404',
      body: "Not Found."
    });
    return;
  }

  // Some older paths in the wild will have an extra "images" component e.g.
  // images/cache/_filter_type_/images/_collection_/_filename_._filetype_?_optional_cachebuster_
  // Need to cater for those and strip the second "image" from source path
  let startPiece = 3;
  if (pieces[3] === 'images') {
    startPiece = 4;
  }

  // extract bucket key for original image, stripping any query params from URL
  const srcKey = pieces.slice(startPiece).join('/').split('?')[0];

  // Destinaton key is the provided URL (minus query params)
  // this ensures further requests for the same URL will be
  // served directly by the bucket public web interface.
  const dstKey = path.split('?')[0];

  console.log('Resizing. arn:aws:s3:::%s/%s ==> arn:aws:s3:::%s/%s', SRC_BUCKET, srcKey, DST_BUCKET, dstKey);

  // Filter(s) to apply
  const selectedFilterSet = filterSet[pieces[2]];

  // - read the original image from the src S3 bucket,
  // - resize it according to the specified filter parameters
  // - store it in the destination S3 bucket
  // - redirect the client to look for the newly created image.
  const storeResizedImage = function(data, filterSet) {
    logger.log('info', 'Selected filter set', filterSet);

    const img = Resize(data, filterSet);

    logger.log('info', 'Storing resized image', DST_BUCKET, dstKey);

    logger.log('info', 'Saving then redirecting to', `${URL}${dstKey}`);

    logger.log('info', 'img data', img.data);

    S3.putObject({
      Body: img.data,
      Bucket: DST_BUCKET,
      ContentType: img.mimeType,
      CacheControl: "public, max-age=2592000",
      Key: dstKey
    }).promise()
    .then(function() {
      // TODO dev only! On prod we use CloudFront!
      return S3.putObjectAcl({
        Bucket: DST_BUCKET,
        Key: dstKey,
        ACL: 'public-read'
      }).promise();
    })
    .then(() => callback(null, {
      statusCode: 301,
      headers: { 'Location': `${URL}${dstKey}` },
      body: null,
    })
    )
    .catch(err => callback(err));
  };

  S3.getObject({ Bucket: SRC_BUCKET, Key: srcKey }, function(err, data) {
      if (err) {
        logger.log('warn', "%s --- %j", err, err.stack);

        // we assume here that the object doesn't exist and we try to get it from the original bucket (production)
        S3.getObject({ Bucket: ORIG_SRC_BUCKET, Key: srcKey }, function(err, data) {
          if (err) {
            logger.log('error', 'Tried to get from orig bucket', err);

            callback(err);
          }

          logger.log('info', 'successfully retrieved data from orig bucket');

          S3.putObject({
              Body: data.Body,
              Bucket: SRC_BUCKET,
              Key: srcKey
          }, function(err, data) {
            if (err) {
              logger.log('error', 'Tried to save to src bucket', err);
            } else {
                logger.log('info', 'Stored image in src bucket');

                storeResizedImage(data.Body, selectedFilterSet);
            }
          });
        });
      } else {
        logger.log('info', 'Found image in src bucket');

        storeResizedImage(data.Body, selectedFilterSet);
      }
  });
};

// - read the original file from the src S3 bucket with "images/" prefix stripped,
// - store it in the destination S3 bucket with the
// - redirect the client to look for the file at original request URL
var Copy = function (event, context, callback) {
  const path = event.queryStringParameters.key;
  var pieces = path.toString().split('/');

  // Valid paths will look something like
  // images/_collection_/_filename_._filetype_?_optional_cachebuster_

  if (pieces.length < 3 || pieces[0] !== 'images') {
    // Send generic 404 to client for clearly invalid paths
    console.log("Invalid path format for file specified : " + path)
    callback(null, {
      statusCode: '404',
      body: "Not Found."
    });
    return;
  }

  // extract bucket key for original URL, stripping any query params from URL
  const srcKey = pieces.slice(1).join('/').split('?')[0];

  // Destinaton key is the provided URL (minus query params)
  // this ensures further requests for the same URL will be
  // served directly by the bucket public web interface.
  const dstKey = path.split('?')[0];

  logger.log('info', 'Copying. arn:aws:s3:::%s/%s ==> arn:aws:s3:::%s/%s', SRC_BUCKET, srcKey, DST_BUCKET, dstKey);

  logger.log('info', 'Saving then redirecting to', `${URL}/${dstKey}`);

  S3.getObject({ Bucket: SRC_BUCKET, Key: srcKey }).promise()
    .then(data => S3.putObject({
      Body: data.Body,
      Bucket: DST_BUCKET,
      ContentType: getCorrectMimeType(dstKey, data.ContentType),
      Key: dstKey
    }).promise()
    )
    .then(() => callback(null, {
      statusCode: 301,
      headers: { 'Location': `${URL}/${dstKey}` },
      body: null,
    })
    )
    .catch(err => callback(err));
};

exports.handler = (event, context, callback) => {
  let path = event.queryStringParameters.key;

  if (path[0] === '/') {
    path = path.substr(1);
  }

  logger.log('info', 'path', path);
  logger.log('info', path.substr(0, 13));

  if (path.substr(0, 13) === 'images/cache/') {
    logger.log('info', 'Image resize and copy');
    return ResizeAndCopy(path, context, callback)
  } else {
    logger.log('info', 'File copy / direct_file_link');
    return Copy(event, context, callback)
  }
};
