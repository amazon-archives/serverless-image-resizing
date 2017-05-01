'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3();
const Sharp = require('sharp');

const BUCKET = process.env.BUCKET;
const URL = process.env.URL;

exports.handler = function(event, context, callback) {
  var originalKey = event.queryStringParameters.key;
  
  if( typeof event.queryStringParameters.w !== 'undefined'){
      var width = parseInt(event.queryStringParameters.w);
  }
  if( typeof event.queryStringParameters.h !== 'undefined'){
      var height = parseInt(event.queryStringParameters.h);
  }
  
if(typeof originalKey !== 'undefined' && originalKey !== "" && (!isNaN(height) || !isNaN(width))){
        var key=originalKey;
        if(!isNaN(height) && height){
          key +=";h="+height;
        }
        
        if(!isNaN(width) && width){
            key +=";w="+width;
        }
        
        S3.getObject({Bucket: BUCKET, Key: originalKey}).promise()
    .then(data => Sharp(data.Body)
      .resize(width, height)
      .toFormat('png')
      .toBuffer()
    )
    .then(buffer => S3.putObject({
        Body: buffer,
        Bucket: BUCKET,
        ContentType: 'image/png',
        Key: key,
      }).promise()
    )
    .then(() => callback(null, {
        statusCode: '301',
        headers: {'location': `${URL}/${key}`},
        body: '',
      })
    )
    .catch(err => callback(err))

} 

}
