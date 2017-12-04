.PHONY: all image package dist clean

all: dist

image:
	docker build --tag amazonlinux:nodejs .

package: image
	docker run --rm --volume ${PWD}/lambda:/build amazonlinux:nodejs npm install --production

dist: package
	cd lambda && zip -FS -q -r ../dist/function.zip *

clean:
	sudo rm -r lambda/node_modules
	docker rmi --force amazonlinux:nodejs
