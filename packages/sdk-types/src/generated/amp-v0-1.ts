// AUTO-GENERATED from schemas/amp/v0.1/*.schema.json
// DO NOT EDIT. Run `pnpm codegen` at repo root to regenerate.
// Upstream SSOT: akari-amp/spec/v0.1/*.schema.json

/**
 * JSON-RPC-style error envelope used across all AMP operations. Error codes mirror MCP /
 * M2C conventions (§14).
 */
export interface AMPErrorResponse {
    error: Error;
}

export interface Error {
    /**
     * JSON-RPC error code. AMP-specific range: -34001..-34008
     */
    code: number;
    /**
     * Implementation-specific error context (memory id, required scope, etc.)
     */
    data?: { [key: string]: any };
    /**
     * Human-readable error description
     */
    message: string;
}

/**
 * Input schemas for the 7 MCP tools exposed by AMP providers (§12.1). Each tool maps 1:1 to
 * an AMP operation (§3.2). The top-level envelope maps tool names to their input shapes so
 * every $def is referenced from the root (required for TypeScript codegen).
 */
export interface AMPMCPToolInputSchemas {
    amp_consolidate?: AmpConsolidate;
    amp_delete?:      AmpDelete;
    amp_encode?:      AmpEncode;
    amp_info?:        AmpInfo;
    amp_reinforce?:   AmpReinforce;
    amp_retrieve?:    AmpRetrieve;
    amp_transform?:   AmpTransform;
    [property: string]: any;
}

/**
 * Merge related memories (§3.2.4)
 */
export interface AmpConsolidate {
    provenance?: Provenance;
    sourceIds:   string[];
    /**
     * Consolidation strategy name (provider-defined)
     */
    strategy?: string;
}

export interface Provenance {
    agent: Agent;
    /**
     * Full provenance chain for audit
     */
    chain?: MemoryRecor[];
    /**
     * Source memory IDs if this memory was consolidated
     */
    consolidatedFrom?: string[];
    /**
     * Session or conversation ID
     */
    sessionId?: string;
    source:     Source;
    /**
     * Source memory ID if this memory was transformed
     */
    transformedFrom?: string;
    [property: string]: any;
}

export interface Agent {
    /**
     * Unique agent identifier
     */
    id: string;
    /**
     * Human-readable agent name
     */
    name: string;
    /**
     * Agent framework or platform (e.g., 'claude-code', 'langchain', 'crewai')
     */
    platform?: string;
    [property: string]: any;
}

export interface MemoryRecor {
    agent:        Agent;
    description?: string;
    operation:    Operation;
    timestamp:    Date;
    [property: string]: any;
}

export type Operation = "encode" | "reinforce" | "consolidate" | "transform" | "import";

export interface Source {
    /**
     * Source-specific confidence
     */
    confidence?: number;
    /**
     * External system name (when kind is 'import')
     */
    externalSystem?: string;
    /**
     * How this memory was created
     */
    kind: Kind;
    /**
     * Transform method (when kind is 'transform')
     */
    method?: string;
    /**
     * Source memory ID (when kind is 'transform')
     */
    sourceId?: string;
    /**
     * Source memory IDs (when kind is 'consolidation')
     */
    sourceIds?: string[];
    /**
     * Tool name (when kind is 'tool_result')
     */
    toolName?: string;
    [property: string]: any;
}

/**
 * How this memory was created
 */
export type Kind = "user_statement" | "observation" | "inference" | "tool_result" | "consolidation" | "transform" | "import";

/**
 * Remove a memory (§3.2.6)
 */
export interface AmpDelete {
    /**
     * If true, physically delete; otherwise mark status='deleted'
     */
    hard?: boolean;
    id:    string;
}

/**
 * Create a new MemoryRecord (§3.2.1)
 */
export interface AmpEncode {
    access?:    Access;
    content:    string;
    metadata?:  { [key: string]: any };
    provenance: Provenance;
    relations?: MCPTool[];
    tags?:      string[];
    type:       TypeElement;
}

export interface Access {
    /**
     * PII classification level
     */
    pii: Pii;
    /**
     * Agent IDs with read access
     */
    readers?: string[];
    /**
     * Visibility scope
     */
    scope: Scope;
    /**
     * Agent IDs with write access
     */
    writers?: string[];
    [property: string]: any;
}

/**
 * PII classification level
 */
export type Pii = "none" | "personal" | "sensitive" | "restricted";

/**
 * Visibility scope
 */
export type Scope = "private" | "agent" | "team" | "public";

export interface MCPTool {
    /**
     * Human-readable label
     */
    label?: string;
    /**
     * Relation strength
     */
    strength: number;
    /**
     * Target memory ID or external URI
     */
    target: string;
    /**
     * Relation type
     */
    type: RelationType;
    [property: string]: any;
}

/**
 * Relation type
 */
export type RelationType = "related_to" | "derived_from" | "contradicts" | "supersedes" | "part_of" | "depends_on" | "co_occurred";

/**
 * Memory type based on cognitive science taxonomy
 */
export type TypeElement = "episodic" | "semantic" | "procedural" | "working";

/**
 * Return provider metadata (§3.2.7). No input parameters.
 */
export interface AmpInfo {
}

/**
 * Strengthen an existing memory (§3.2.3)
 */
export interface AmpReinforce {
    additionalContent?: string;
    id:                 string;
    provenance:         Provenance;
}

/**
 * Search memories (§3.2.2). Example in §12.2.
 */
export interface AmpRetrieve {
    agentId?:       string;
    limit?:         number;
    minConfidence?: number;
    /**
     * AccessScope filter
     */
    scope?: string;
    tags?:  string[];
    /**
     * Semantic search query
     */
    text?:      string;
    timeRange?: TimeRange;
    types?:     TypeElement[];
}

export interface TimeRange {
    after?:  Date;
    before?: Date;
}

/**
 * Convert between memory types or apply a transform (§3.2.5)
 */
export interface AmpTransform {
    id:         string;
    reason?:    string;
    targetType: TypeElement;
}

/**
 * Standardized memory record for AI agents, defined by the Agent Memory Protocol (AMP)
 */
export interface AMPMemoryRecord {
    access: Access;
    /**
     * Confidence score indicating memory reliability
     */
    confidence: number;
    /**
     * Human-readable memory content (natural language)
     */
    content: string;
    /**
     * Creation timestamp (ISO 8601 UTC)
     */
    createdAt: Date;
    /**
     * Decay rate override (uses type default if omitted)
     */
    decayRate?: number;
    /**
     * Extension fields (namespaced)
     */
    extensions?: { [key: string]: any };
    /**
     * Unique identifier (UUID v7 recommended)
     */
    id: string;
    /**
     * Type-specific structured data
     */
    metadata?:  { [key: string]: any };
    provenance: Provenance;
    /**
     * Number of times this memory has been reinforced
     */
    reinforcement: number;
    /**
     * Relations to other memories or external entities
     */
    relations: MCPTool[];
    /**
     * Memory status
     */
    status: Status;
    /**
     * Categorization tags
     */
    tags: string[];
    /**
     * Memory type based on cognitive science taxonomy
     */
    type: TypeElement;
    /**
     * Last update timestamp (ISO 8601 UTC)
     */
    updatedAt: Date;
    [property: string]: any;
}

/**
 * Memory status
 */
export type Status = "active" | "consolidated" | "archived";

