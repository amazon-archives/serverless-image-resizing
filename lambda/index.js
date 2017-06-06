'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3();
const Sharp = require('sharp');


// These need to be defined in AWS with the Lambda
const SRC_BUCKET = process.env.SRC_BUCKET;
const DST_BUCKET = process.env.DST_BUCKET;
const URL = process.env.URL;


// JSON file generated from the "liip_imagine -> filter_sets" section of
// neighbourly/app/config.yml file.
//
// A one-off way of producing this is to cut and paste the liip_image section
// from the config into a new file, and run the following command:
// $ ruby -ryaml -rjson -e 'puts JSON.pretty_generate(YAML.load(ARGF)["liip_imagine"]["filter_sets"])' < liip_imagine_filter_sets.yaml > liip_imagine_filter_sets.json
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
  var img = Sharp(imgData)

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
      console.log("Upscale to " + u.min[0] + " x " + u.min[1])
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

      img = img.resize(f.size[0], f.size[1])

      if (!enlarge) {
        img = img.withoutEnlargement();
      }

      if (f.mode === "inset") {
        img = img.max();
      }

      console.log("Thumbnail to " + f.size[0] + " x " + f.size[1] + " (" + f.mode + ")");
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
      console.log("Widening to " + r.widen);
    }
  }

  // jpegs may have optional quality setting
  if (filterSet.hasOwnProperty('quality')) {
    jpegOptions = { quality: filterSet.Quality };
  }


  return img.metadata()
    .then(metadata => {
      console.log("Source image format: " + metadata.format);
      imageFormat = metadata.format;

      if (imageFormat === "jpeg") {
        outputOptions = jpegOptions;
      }

      return img.toFormat(metadata.format, outputOptions)
        .toBuffer()
        .then(buffer => {
          return { data: buffer, mimeType: "image/" + metadata.format }
        })
    })
}


var ResizeAndCopy = function (event, context, callback) {

  const path = event.queryStringParameters.key;
  var pieces = path.toString().split('/');

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

  // extract bucket key for original image, stripping any query params from URL
  const srcKey = pieces.slice(3).join('/').split('?')[0];

  // Destinaton key is the provided URL (minus query params)
  // this ensures further requests for the same URL will be
  // served directly by the bucket public web interface.
  const dstKey = path.split('?')[0];

  // Filter(s) to apply
  const selectedFilterSet = filterSet[pieces[2]];



  // - read the original image from the src S3 bucket,
  // - resize it according to the specified filter parameters
  // - store it in the destination S3 bucket
  // - redirect the client to look for the newly created image.
  S3.getObject({ Bucket: SRC_BUCKET, Key: srcKey }).promise()
    .then(data => Resize(data.Body, selectedFilterSet))
    .then(img => S3.putObject({
      Body: img.data,
      Bucket: DST_BUCKET,
      ContentType: img.mimeType,
      CacheControl: "public, max-age=2592000",
      Key: dstKey,
    }).promise()
    )
    .then(() => callback(null, {
      statusCode: '301',
      headers: { 'location': `${URL}/${dstKey}` },
      body: '',
    })
    )
    .catch(err => callback(err))
}

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

  //console.log("srcKey: " + srcKey)
  //console.log("dstKey: " + dstKey)

  S3.getObject({ Bucket: SRC_BUCKET, Key: srcKey }).promise()
    .then(data => S3.putObject({
      Body: data.Body,
      Bucket: DST_BUCKET,
      ContentType: data.ContentType,
      Key: dstKey
    }).promise()
    )
    .then(() => callback(null, {
      statusCode: '301',
      headers: { 'location': `${URL}/${dstKey}` },
      body: '',
    })
    )
    .catch(err => callback(err))
}

exports.handler = (event, context, callback) => {

  // If it's for an image that needs resizing...
  if (event.queryStringParameters.key.substr(0, 13) === 'images/cache/') {
    return ResizeAndCopy(event, context, callback)
  } else {
    // It's just something that used to be served up via direct_file_link
    return Copy(event, context, callback)
  }
};