# Serverless Image Resizing

![](https://pbs.twimg.com/media/CriRuZNVIAAPNm7.jpg)

## Description

This is a fork of the sample serverless-image-resizing repo:
[https://github.com/awslabs/serverless-image-resizing]()

This fork is specifically for managing the neighbourly user-uploaded images, and provide a seamless drop-in replacement for the image resizing functionality currently provided by the LiipImagine Symfony Bundle.

A good explanation of how this process works can be found in this blog post:
[https://aws.amazon.com/blogs/compute/resize-images-on-the-fly-with-amazon-s3-aws-lambda-and-amazon-api-gateway/]()
 

The main differences between this fork and the original one are:

- This reads the source images from one bucket, and writes the scaled images to a separate one (hence the required `SRC_BUCKET` and `DST_BUCKET` environment variables, as well as `URL`)

- This version reads a JSON file containing a list of filter names and descriptions. This file has been generated from the PHP YAML config file in the neighboury project.

- This version uses the filter names and descriptions above to decide what transformations should be performed on the requested images.


Some of the documentation below doesn't apply anymore since the fork (e.g. the cloudformation stuff), but I'll leave it here for reference until replacement / relevant docs can be written. Caveat emptor.



## Description (original)

Resizes images on the fly using Amazon S3, AWS Lambda, and Amazon API Gateway. Using a conventional URL structure and S3 static website hosting with redirection rules, requests for resized images are redirected to a Lambda function via API Gateway which will resize the image, upload it to S3, and redirect the requestor to the resized image. The next request for the resized image will be served from S3 directly.

## Usage

1. Build the Lambda function

   The Lambda function uses [sharp][sharp] for image resizing which requires native extensions. In order to run on Lambda, it must be packaged on Amazon Linux. You can accomplish this in one of two ways:

   - Upload the contents of the `lambda` subdirectory to a [Amazon EC2 instance running Amazon Linux][amazon-linux] and run `npm install`, or

   - Use the Amazon Linux Docker container image to build the package using your local system. This repo includes Makefile that will download Amazon Linux, install Node.js and developer tools, and build the extensions using Docker. Run `make all`.

1. Deploy the CloudFormation stack

  Run `bin/deploy` to deploy the CloudFormation stack. It will create a temporary Amazon S3 bucket, package and upload the function, and create the Lambda function, Amazon API Gateway RestApi, and an S3 bucket for images via CloudFormation.

  The deployment script requires the [AWS CLI][cli] version 1.11.19 or newer to be installed.

1. Test the function

	Upload an image to the S3 bucket and try to resize it via your web browser to different sizes, e.g. with an image uploaded in the bucket called image.png:

	- http://[BucketWebsiteHost]/300x300/image.png
	- http://[BucketWebsiteHost]/90x90/image.png
	- http://[BucketWebsiteHost]/40x40/image.png

	You can find the BucketWebsiteUrl in the table of outputs displayed on a successful invocation of the deploy script.

**Note:** If you create the Lambda function yourself, make sure to select Node.js version 6.10.

## License

This reference architecture sample is [licensed][license] under Apache 2.0.

[license]: LICENSE
[sharp]: https://github.com/lovell/sharp
[amazon-linux]: https://aws.amazon.com/blogs/compute/nodejs-packages-in-lambda/
[cli]: https://aws.amazon.com/cli/
