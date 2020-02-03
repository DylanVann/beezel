#!/usr/bin/env node

import 'hard-rejection/register'
import fs from 'fs-extra'
import path from 'path'
import { cacheDir } from 'paths'
import { syncYarn } from 'syncYarn'
import { syncPackages } from './syncPackages'
import { getGlobalHash } from './getGlobalHash'
import chalk from 'chalk'

const run = async () => {
  const pkg = require(path.join(__dirname, '..', 'package.json'))
  console.log(`Beezel - v${pkg.version}`)
  const globalHash = await getGlobalHash()
  console.log(`${chalk.bold('Global hash')}: ${globalHash}`)
  await fs.ensureDir(cacheDir)
  await syncYarn()
  await syncPackages()
}

run()
