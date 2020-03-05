import path from 'path'
import findWorkspaceRoot from 'find-yarn-workspace-root'
import { env } from './env'

const getRoot = (): string => {
  const root = findWorkspaceRoot()
  if (!root) {
    throw new Error('Could not find workspace root.')
  }
  return root
}

export const root = getRoot()
export const cacheDir = env.BEEZEL_CACHE_FOLDER.startsWith('.')
  ? path.join(root, env.BEEZEL_CACHE_FOLDER)
  : env.BEEZEL_CACHE_FOLDER
