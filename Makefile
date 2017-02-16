.PHONY: all image package dist clean

all: clean dist

image:
	docker build --tag amazonlinux:nodejs .

package: image
	docker run --rm --volume ${PWD}/lambda:/build amazonlinux:nodejs npm install --production

dist: package
	cd lambda && zip -r ../dist/function.zip *

clean:
	if [ -a lambda/node_modules ]; then rm -r lambda/node_modules; fi;
	if [ -a dist/function.zip ]; then rm -r dist/function.zip; fi;
	docker images --quiet amazonlinux:nodejs | xargs docker rmi --force
