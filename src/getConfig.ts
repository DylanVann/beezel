import { root } from './paths'
import path from 'path'
import fs from 'fs-extra'

export const getConfig = async (): Promise<{
  otherYarnCaches?: string[]
  globalDependencies: string[]
}> => {
  const pkg = await fs.readJson(path.join(root, 'package.json'))
  return pkg.beezel || {}
}
