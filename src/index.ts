#!/usr/bin/env node

import "hard-rejection/register"
import { runYarn } from "./syncYarn"
import { syncPackages } from "./syncPackages"
import fs from "fs-extra"
import { cacheDir } from "paths"

const run = async () => {
  console.log(`Beezel - v0.0.x`)
  await fs.ensureDir(cacheDir)
  await runYarn()
  await syncPackages()
}

run()
