#!/usr/bin/env node

import "hard-rejection/register"
import { syncYarn, uploadYarn } from "./syncYarn"
import { syncPackages } from "./syncPackages"
import fs from "fs-extra"
import { cacheDir } from "paths"

const run = async () => {
  await fs.ensureDir(cacheDir)
  const { shouldUpload } = await syncYarn()
  const promises: Promise<any>[] = []
  promises.push(syncPackages())
  if (shouldUpload) {
    promises.push(uploadYarn())
  }
  await Promise.all(promises)
}

run()
