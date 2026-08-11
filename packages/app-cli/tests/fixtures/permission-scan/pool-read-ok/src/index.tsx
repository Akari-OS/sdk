import { getItem, listWorkspaces, listItems } from "@akari-os/sdk/pool"

export async function run() {
  const workspaces = await listWorkspaces()
  const items = await listItems(workspaces[0]?.name ?? "default")
  return getItem(workspaces[0]?.name ?? "default", items[0]?.id ?? "")
}
