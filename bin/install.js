#!/usr/bin/env node

const fs = require('fs')
const { execSync } = require('child_process')

execSync('npm pack beezel')
try {
  execSync('mkdir .beezel')
} catch (e) {
  // ignore if it was already there
}
const version = execSync('npm view beezel version', { encoding: 'utf8' }).trim()
const packageFile = `beezel-${version}.tgz`
execSync(
  `tar --strip-components=2 -C .beezel -zvxf ${packageFile} package/dist/index.js package/dist/package.json`,
)
execSync(`rm ${packageFile}`)
