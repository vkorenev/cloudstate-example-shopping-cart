## Building container image

Install build dependencies
```
npm install
```
Delete previously built artifacts (optionally)
```
npm run clean
```
Compile sources and build a Docker image
```
npm run dockerbuild
```
Publish the image
```
npm run dockerpublish
```
