.PHONY: all image package dist deploy clean

all: image dist

image:
	docker build --tag amazonlinux:nodejs .

awsconfigure:
	docker run -it --rm --volume ${PWD}/../.aws:/root/.aws amazonlinux:nodejs aws configure

package:
	docker run --rm --volume ${PWD}/lambda:/build --volume imgresize-modules:/build/node_modules amazonlinux:nodejs npm install --production

dist: package
	docker run --rm --volume ${PWD}/lambda:/build --volume imgresize-modules:/build/node_modules -v ${PWD}/dist:/dist amazonlinux:nodejs sh -c 'zip -r /dist/function.zip *'

deploy:
	docker run --rm --volume ${PWD}:/build -v ${PWD}/../.aws:/root/.aws:ro amazonlinux:nodejs bin/deploy

clean:
	docker volume ls | grep imgresize-modules && docker volume rm imgresize-modules || echo no existing volume
	rm -f ./dist/function.zip
