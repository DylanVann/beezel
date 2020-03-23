import { root } from './paths'
import path from 'path'
import fs from 'fs-extra'

export const getConfig = async (): Promise<{
  otherYarnCaches?: string[]
  globalDependencies: string[]
}> => {
  const packageJsonPath = path.join(root, 'package.json')
  const pkg = await fs.readJson(packageJsonPath)
  if (!pkg) {
    throw new Error(`Could not find package.json at ${packageJsonPath}`)
  }
  return pkg.beezel || {}
}
