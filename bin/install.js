#!/usr/bin/env node

const fs = require('fs')
const { execSync } = require('child_process')

execSync('npm pack beezel', { stdio: 'ignore' })

try {
  execSync('mkdir .beezel', { stdio: 'ignore' })
} catch (e) {
  // ignore if it was already there
}

const version = execSync('npm view beezel version', {
  encoding: 'utf8',
  stdio: 'ignore',
}).trim()

const packageFile = `beezel-${version}.tgz`

execSync(
  `tar --strip-components=2 -C .beezel -zvxf ${packageFile} package/dist/index.js package/dist/package.json`,
  { stdio: 'ignore' },
)

execSync(`rm ${packageFile}`, { stdio: 'ignore' })
