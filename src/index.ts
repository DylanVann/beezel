#!/usr/bin/env node

import "hard-rejection/register"
import { syncPackages } from "./syncPackages"
import fs from "fs-extra"
import path from "path"
import { cacheDir } from "paths"

const run = async () => {
  const pkg = require(path.join(__dirname, "..", "package.json"))
  console.log(`Beezel - v${pkg.version}`)
  await fs.ensureDir(cacheDir)
  await syncPackages()
}

run()
