# Serverless Image Resizing

## Short tutorial:

- Run `make all`
- Run `bin/deploy`
- Copy url and paste it to browser.


## Description

Resizes images on the fly using Amazon S3, AWS Lambda, and Amazon API Gateway. Using a conventional URL structure and S3 static website hosting with redirection rules, requests for resized images are redirected to a Lambda function via API Gateway which will resize the image, upload it to S3, and redirect the requestor to the resized image. The next request for the resized image will be served from S3 directly.

## Usage

1. Build the Lambda function

   The Lambda function uses [sharp][sharp] for image resizing which requires native extensions. In order to run on Lambda, it must be packaged on Amazon Linux. You can accomplish this in one of two ways:

   - Upload the contents of the `lambda` subdirectory to a [Amazon EC2 instance running Amazon Linux][amazon-linux] and run `npm install`, or

   - Use the Amazon Linux Docker container image to build the package using your local system. This repo includes Makefile that will download Amazon Linux, install Node.js and developer tools, and build the extensions using Docker. Run `make all`. if you want to clean afterwards run `make clean`. You can also call each command separatly from `makefile`.

1. Deploy the CloudFormation stack

  Run `bin/deploy` to deploy the CloudFormation stack. It will create a temporary Amazon S3 bucket, package and upload the function, and create the Lambda function, Amazon API Gateway RestApi, and an S3 bucket for images via CloudFormation.

  The deployment script requires the [AWS CLI][cli] version 1.11.19 or newer to be installed.

1. Test the function

	Upload an image to the S3 bucket and try to resize it via your web browser to different sizes, e.g. with an image uploaded in the bucket called image.png:


[BucketWebsiteHost] => **{bucket}.s3website-{region}-amazon.com**


example:
```
      - mybucket.s3website-eu-west1-amazon.com/image.png -> original. 
      - mybucket.s3website-eu-west1-amazon.com/300/image.png -> resized
      - mybucket.s3website-eu-west1-amazon.com/300x300/image.png -> resized same as above
```
	- http://[BucketWebsiteHost]/300x300/image.png
	- http://[BucketWebsiteHost]/90x90/image.png
	- http://[BucketWebsiteHost]/40x40/image.png
	
Added tagging: **"resized=true"** to be able to create delete timeout on resized images. 
	

	You can find the BucketWebsiteUrl in the table of outputs 
	displayed on a successful invocation of the deploy script.

**Note:** If you create the Lambda function yourself, make sure to select Node.js version 6.10.

## License

This reference architecture sample is [licensed][license] under Apache 2.0.

[license]: LICENSE
[sharp]: https://github.com/lovell/sharp
[amazon-linux]: https://aws.amazon.com/blogs/compute/nodejs-packages-in-lambda/
[cli]: https://aws.amazon.com/cli/
