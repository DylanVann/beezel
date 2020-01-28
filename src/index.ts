#!/usr/bin/env node

import "hard-rejection/register"
import { syncYarn } from "./syncYarn"
import { syncPackages } from "./syncPackages"
import fs from "fs-extra"
import { cacheDir } from "paths"

const run = async () => {
  await fs.ensureDir(cacheDir)
  await syncYarn()
  await syncPackages()
}

run()
