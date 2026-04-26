/**
 * @file api/index.ts
 * AKARI App SDK — 7 API implementations (Phase 0 skeleton).
 *
 * Exports the unified SDK surface that Apps use to interact with AKARI Core.
 *
 * @see https://github.com/Akari-OS/sdk/docs/api-reference/
 */

import { createAgentAPI } from "./agent-api.js"
import { createMemoryAPI } from "./memory-api.js"
import { createContextAPI } from "./context-api.js"
import { createUIAPI } from "./ui-api.js"
import { createInterAppAPI } from "./inter-app-api.js"
import { createPermissionAPI } from "./permission-api.js"
import { createSkillAPI } from "./skill-api.js"

/**
 * Unified SDK surface.
 * Each property is one of the 7 API groups.
 */
export interface AkariSDK {
  agent: import("./agent-api.js").AgentAPI
  memory: import("./memory-api.js").MemoryAPI
  context: import("./context-api.js").ContextAPI
  ui: import("./ui-api.js").UIAPI
  app: import("./inter-app-api.js").InterAppAPI
  permission: import("./permission-api.js").PermissionAPIImpl
  skill: import("./skill-api.js").SkillAPIImpl
}

/**
 * Factory function to create the unified SDK.
 * Called once at App startup by the Core.
 *
 * @returns The complete AKARI SDK surface
 */
export function createAkariSDK(): AkariSDK {
  return {
    agent: createAgentAPI(),
    memory: createMemoryAPI(),
    context: createContextAPI(),
    ui: createUIAPI(),
    app: createInterAppAPI(),
    permission: createPermissionAPI(),
    skill: createSkillAPI(),
  }
}

/**
 * Singleton instance of the SDK (initialized by Core at App startup).
 * Apps should import from `@akari-os/sdk` instead of calling this directly.
 */
let sdkInstance: AkariSDK | null = null

/**
 * Initialize the global SDK instance (internal use only — called by Core).
 */
export function initializeSDK(sdk: AkariSDK): void {
  sdkInstance = sdk
}

/**
 * Get the global SDK instance.
 * Throws if SDK not yet initialized.
 */
export function getSDK(): AkariSDK {
  if (!sdkInstance) {
    throw new Error(
      "AKARI SDK not initialized. Did the Core forget to call initializeSDK()?"
    )
  }
  return sdkInstance
}
