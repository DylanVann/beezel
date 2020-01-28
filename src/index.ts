#!/usr/bin/env node

import "hard-rejection/register"
import { syncYarn, uploadYarn } from "./syncYarn"
import { syncPackages } from "./syncPackages"
import fs from "fs-extra"
import { cacheDir } from "paths"

const run = async () => {
  await fs.ensureDir(cacheDir)
  await syncYarn()
  await Promise.all([uploadYarn(), syncPackages()])
}

run()
