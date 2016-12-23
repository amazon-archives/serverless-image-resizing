.PHONY: image package clean

all: image package

image:
	docker build --tag amazonlinux:nodejs .

package:
	docker run --rm --volume ${PWD}/lambda:/build amazonlinux:nodejs npm install --production

clean:
	rm -r lambda/node_modules && docker rmi --force amazonlinux:nodejs
