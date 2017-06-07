# Serverless Image Resizing

![](https://pbs.twimg.com/media/CriRuZNVIAAPNm7.jpg)

## Description

This is a fork of the sample serverless-image-resizing repo:
[https://github.com/awslabs/serverless-image-resizing]()

A good explanation of how this process works can be found in this blog post:
[https://aws.amazon.com/blogs/compute/resize-images-on-the-fly-with-amazon-s3-aws-lambda-and-amazon-api-gateway/]()


This fork is specifically for managing the neighbourly user-uploaded images and static files served via Gaufrette and the LiipImagineBundle, and provide a seamless drop-in replacement for the image resizing functionality. The aim is to bypass the PHP stack and let Cloudfront serve these files directly from an S3 bucket.

###The main differences between this fork and the original one are:

- This reads the source images from one bucket, and writes the (scaled) images to a separate one (hence the required `SRC_BUCKET` and `DST_BUCKET` environment variables, as well as `URL`)

- This version reads a JSON file containing a list of filter names and descriptions. This file has been generated from [a section of the PHP YAML config file in the neighbourly project.](https://github.com/ideahq/neighbourly/blob/master/app/config/config.yml#L1058-L1257) ([Read the source to see how I did that.](https://github.com/ideahq/serverless-image-resizing/blob/master/lambda/index.js#L18) We'll probably change this process later)

- This version uses the filter names and descriptions defined above to decide what transformations should be performed on the requested images (the original one gets that info directly from the URL, this one maps a portion of URL to one of the above named filters)

- If given a url that begins with `/images/cache` it assumes it is performing an image resize based on one of the filters. This is primarily a replacement for the files currently served through the neighbourly\_imagine\_filter controllers.

- If given a url that begins with `/images/<not cache>` it assumes it is just copying the source file to the destination bucket at the requested URL. This is primarily a replacement for the files currently served through the direct\_file\_link and direct\_document\_link controllers. Moving files like this allows Cloudfront to subsequently directly serve the file from the bucket at the requested location. 

	_(This second piece of functionality was added later and would be better implemented by a URL rewrite using a Lambda@Edge running directly on Cloudfront, but that is currently in private beta and we are awaiting access)_

## Usage

1. Build the Lambda function

   The Lambda function uses [sharp][sharp] for image resizing which requires native extensions. In order to run on Lambda, it must be packaged on Amazon Linux. You're going to need Docker installed.

	Use the Amazon Linux Docker container image to build the package using your local system. This repo includes Makefile that will download Amazon Linux, install Node.js and developer tools, and build the extensions using Docker. Run `make all`.

2. Upload the resulting `dist/function.zip` file to the `resize` [lambda defined here](https://ap-southeast-2.console.aws.amazon.com/lambda/home?region=ap-southeast-2#/functions/resize?tab=code) and test it. (There is a test event configured simliar to the Cloufdfront upstream requests it will receive)


## Notes
Don't use the Cloudformation stuff included here; it's a leftover from the original repo this was forked from, and not appropriate for our use case.

The required Neighbourly infrastructure components have been manually built currently. These include:

- The `resize` [lambda](https://ap-southeast-2.console.aws.amazon.com/lambda/home?region=ap-southeast-2#/functions/resize?tab=code)
- The new `neighbourly-public-images` [bucket](https://console.aws.amazon.com/s3/buckets/neighbourly-public-images/?region=ap-southeast-2&tab=overview), including the Static Website configuration and a 404 handler configured via Redirection Rules
- The IAM `image-resizer` [role](https://console.aws.amazon.com/iam/home?region=ap-southeast-2#/roles/image-resizer) used by the lambda, which gives it read access to the [source bucket](https://console.aws.amazon.com/s3/buckets/neighbourly-public/?region=ap-southeast-2&tab=overview) and write access to the [destination bucket](https://console.aws.amazon.com/s3/buckets/neighbourly-public-images/?region=ap-southeast-2&tab=overview)
- The [API Gateway endpoint](https://ap-southeast-2.console.aws.amazon.com/apigateway/home?region=ap-southeast-2#/apis/zyhjrrhx3l/resources/kfcp810y0f) used to expose the Lambda via HTTPS
- The Cloudfront Distribution [cdn2.neighbourly.co.nz](https://console.aws.amazon.com/cloudfront/home?region=ap-southeast-2#distribution-settings:ENKL1H0IIK16B)