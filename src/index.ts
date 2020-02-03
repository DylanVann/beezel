#!/usr/bin/env node

import 'hard-rejection/register'
import fs from 'fs-extra'
import { cacheDir } from 'paths'
import { syncYarn } from 'syncYarn'
import { syncPackages } from './syncPackages'
import { getGlobalHash } from './getGlobalHash'
import { version } from './version'
import chalk from 'chalk'

const run = async () => {
  console.log(`Beezel - v${version}`)
  const globalHash = await getGlobalHash()
  console.log(`${chalk.bold('Global hash')}: ${globalHash}`)
  await fs.ensureDir(cacheDir)
  await syncYarn()
  await syncPackages()
}

run()
