# Serverless Image Resizing

## Description

Resizes images on the fly using Amazon S3, AWS Lambda, and Amazon API Gateway. Using a conventional URL structure and S3 static website hosting with redirection rules, requests for resized images are redirected to a Lambda function via API Gateway which will resize the image, upload it to S3, and redirect the requestor to the resized image. The next request for the resized image will be served from S3 directly.

## Usage

1. Build the Lambda function

   The Lambda function uses [sharp][sharp] for image resizing which requires native extensions. In order to run on Lambda, it must be packaged on Amazon Linux. To do this, you can either run `npm install` on an [Amazon EC2 instance running Amazon Linux][amazon-linux] or use the Amazon Linux Docker container image.

   To use Docker: run `make` from the project directory and it'll download Amazon Linux, install Node.js and developer tools, and build the extensions.

1. Deploy the CloudFormation stack

  Run `bin/deploy REGION` to deploy the CloudFormation stack. It will create a temporary Amazon S3 bucket, package and upload the function, and create the Lambda function, Amazon API Gateway RestApi, and an S3 bucket for images via CloudFormation. e.g.:

  ```console
  ./bin/deploy us-west-2
  ```

1. Test the function

	Upload an image to the S3 bucket and try to resize it via your web browser to different sizes, e.g. with an image uploaded in the bucket called image.png:

	- http://[BucketWebsiteHost]/300x300/image.png
	- http://[BucketWebsiteHost]/90x90/image.png
	- http://[BucketWebsiteHost]/40x40/image.png

## License

This reference architecture sample is [licensed][license] under Apache 2.0.

[sharp]: https://github.com/lovell/sharp
[amazon-linux]: https://aws.amazon.com/blogs/compute/nodejs-packages-in-lambda/
[license]: LICENSE
