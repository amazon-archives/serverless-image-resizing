.PHONY: all image package clean

all: package

image:
	docker build --tag amazonlinux:nodejs .

package: image
	docker run --rm --volume ${PWD}/lambda:/build amazonlinux:nodejs npm install --production
	cd lambda && zip -r ../dist/function.zip *

clean:
	rm -r lambda/node_modules
	docker rmi --force amazonlinux:nodejs
