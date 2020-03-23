import findWorkspaceRoot from 'find-yarn-workspace-root'

const getRoot = (): string => {
  const root = findWorkspaceRoot(process.cwd())
  if (!root) {
    throw new Error('Could not find workspace root.')
  }
  return root
}

export const root = getRoot()
