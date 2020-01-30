import path from 'path'
import findWorkspaceRoot from 'find-yarn-workspace-root'

const getRoot = (): string => {
  const root = findWorkspaceRoot()
  if (!root) {
    throw new Error('Could not find workspace root.')
  }
  return root
}

export const root = getRoot()
export const cacheDir = path.join(root, '.beezel-cache')
