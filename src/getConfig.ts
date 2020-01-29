import { cosmiconfig } from "cosmiconfig"
import { root } from "./paths"

export const getConfig = async () => {
  const configResult = await cosmiconfig("beezel").load(root)
  return (configResult || {}).config || {}
}
