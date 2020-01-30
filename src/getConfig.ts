import { cosmiconfig } from 'cosmiconfig'
import { root } from './paths'

export const getConfig = async () => {
  const configResult = await cosmiconfig('beezel').search(root)
  return (configResult || {}).config || {}
}
