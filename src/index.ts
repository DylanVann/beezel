#!/usr/bin/env node

import 'hard-rejection/register'
import fs from 'fs-extra'
import path from 'path'
import { cacheDir } from 'paths'
import { syncYarn } from 'syncYarn'
import { syncPackages } from './syncPackages'

const run = async () => {
  const pkg = require(path.join(__dirname, '..', 'package.json'))
  console.log(`Beezel - v${pkg.version}`)
  await fs.ensureDir(cacheDir)
  await syncYarn()
  await syncPackages()
}

run()
