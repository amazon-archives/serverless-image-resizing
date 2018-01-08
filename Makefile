.PHONY: all image package docker dist build clean

all: package

image:
	docker build --tag amazonlinux:nodejs .

docker:
	docker run --rm --volume ${PWD}/lambda:/build amazonlinux:nodejs npm install --production

package: image docker

dist: package build

build:
	cd lambda && zip -FS -q -r ../dist/function.zip *

clean:
	rm -r lambda/node_modules
	docker rmi --force amazonlinux:nodejs
