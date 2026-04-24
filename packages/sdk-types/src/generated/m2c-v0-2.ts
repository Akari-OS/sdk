// AUTO-GENERATED from schemas/m2c/v0.2/*.schema.json
// DO NOT EDIT. Run `pnpm codegen` at repo root to regenerate.
// Upstream SSOT: akari-m2c/spec/v0.2/*.schema.json

/**
 * Capabilities announced by an M2C provider at connection time (§6.1). Used by consumers to
 * choose a compatible provider and scope their requests.
 */
export interface M2CProviderCapabilities {
    capabilities: Capabilities;
    /**
     * Date-based protocol version (YYYY-MM-DD)
     */
    protocolVersion: string;
}

export interface Capabilities {
    /**
     * Optional extension module names beyond the core set
     */
    extensions?: string[];
    /**
     * Maximum media duration in seconds the provider accepts (0 = unlimited)
     */
    maxDuration?: number;
    /**
     * Media types the provider can process. Core: video, image, audio, music, document,
     * presentation, spreadsheet, vector, 3d, archive, data. Custom types use x- prefix.
     */
    mediaTypes: string[];
    /**
     * Analysis module names the provider can run (e.g. scene, transcription, visual, color,
     * summary)
     */
    modules:         string[];
    precisionLevels: PrecisionLevel[];
    /**
     * Optional Supply module capabilities (see supply.md)
     */
    supply?: Supply;
}

export type PrecisionLevel = "quick" | "standard" | "deep";

/**
 * Optional Supply module capabilities (see supply.md)
 */
export interface Supply {
    compression?:   boolean;
    contextLevels?: ContextLevel[];
    isolation?:     boolean;
}

/**
 * Supply context level (optional, requires Supply module support on provider side)
 */
export type ContextLevel = "L0" | "L1" | "L2" | "L3";

/**
 * Request payload sent by an M2C consumer at negotiation time (§6.2). The provider responds
 * with the subset it can fulfill based on its Capabilities (capabilities.schema.json).
 */
export interface M2CConsumerRequest {
    /**
     * Date-based protocol version (YYYY-MM-DD)
     */
    protocolVersion: string;
    requested:       Requested;
}

export interface Requested {
    /**
     * Supply context level (optional, requires Supply module support on provider side)
     */
    contextLevel?: ContextLevel;
    /**
     * Upper bound on returned context token count (hint for cost / latency budget)
     */
    maxTokens?: number;
    /**
     * Requested analysis modules. Must be a subset of the provider's advertised
     * capabilities.modules.
     */
    modules:        string[];
    precisionLevel: PrecisionLevel;
}

/**
 * Structured context extracted from media by M2C analysis pipeline
 */
export interface M2CMediaContextV02 {
    acoustic?: Acoustic;
    /**
     * ISO 8601 timestamp of analysis completion
     */
    analyzedAt: Date;
    /**
     * IDs of modules that contributed to this context
     */
    analyzedModules: string[];
    /**
     * Dominant colors as hex codes
     */
    colorPalette?: string[];
    /**
     * Aggregate confidence score
     */
    confidence:     number;
    contextPolicy?: ContextPolicy;
    /**
     * Duration in seconds (0 for non-temporal media)
     */
    duration?: number;
    /**
     * Domain-specific extensions. Use namespaced keys (e.g., 'style.cutTempo',
     * 'brand.guidelines').
     */
    extensions?: { [key: string]: any };
    /**
     * Media type. Core types: video, image, audio, music, document, presentation, spreadsheet,
     * vector, 3d, archive, data. Custom types use x- prefix.
     */
    mediaType: string;
    /**
     * Mood/atmosphere labels. See Appendix A for recommended vocabulary.
     */
    moods?: string[];
    /**
     * Precision level used for analysis
     */
    precisionLevel: string;
    /**
     * Scene-level context (temporal media only)
     */
    scenes?: SceneElement[];
    /**
     * Date-based schema version (YYYY-MM-DD)
     */
    schemaVersion: string;
    speakers?:     SpeakerElement[];
    /**
     * AI-generated summary of the media content
     */
    summary: string;
    /**
     * Content tags (AI-generated + user-added)
     */
    tags:           string[];
    transcription?: TranscriptionElement[];
    visual?:        Visual;
    [property: string]: any;
}

export interface Acoustic {
    bgmSegments?:     BgmSegment[];
    events?:          Event[];
    hasMusic?:        boolean;
    musicRatio?:      number;
    silenceSegments?: SilenceSegment[];
    [property: string]: any;
}

export interface BgmSegment {
    confidence?: number;
    end?:        number;
    mood?:       string;
    start?:      number;
    [property: string]: any;
}

export interface Event {
    confidence?: number;
    time?:       number;
    type?:       string;
    [property: string]: any;
}

export interface SilenceSegment {
    end?:   number;
    start?: number;
    [property: string]: any;
}

/**
 * Isolation and delivery policy for context supply
 */
export interface ContextPolicy {
    /**
     * Intended consumers (e.g., 'planner', 'worker', 'user')
     */
    audience?: string[];
    /**
     * Which modalities to include (e.g., 'visual', 'transcription', 'acoustic')
     */
    modalities?: string[];
    /**
     * Relative priority for token budget allocation
     */
    priority?: number;
    /**
     * Time range this context applies to
     */
    temporalScope?: TemporalScope;
    [property: string]: any;
}

/**
 * Time range this context applies to
 */
export interface TemporalScope {
    end?:   number;
    start?: number;
    [property: string]: any;
}

export interface SceneElement {
    colorPalette?: string[];
    confidence?:   number;
    /**
     * End time in seconds
     */
    end:   number;
    index: number;
    /**
     * URI to representative keyframe
     */
    keyframeUri?: string;
    moods?:       string[];
    objects?:     string[];
    /**
     * Start time in seconds
     */
    start:       number;
    summary:     string;
    transcript?: string;
    [property: string]: any;
}

export interface SpeakerElement {
    id:     string;
    label?: string;
    /**
     * Speaking ratio (0-1)
     */
    ratio?: number;
    [property: string]: any;
}

export interface TranscriptionElement {
    confidence?: number;
    end:         number;
    /**
     * BCP 47 language tag
     */
    language?: string;
    speaker?:  null | string;
    start:     number;
    text:      string;
    [property: string]: any;
}

export interface Visual {
    averageBrightness?: number;
    dominantColors?:    string[];
    faceCount?:         number;
    objectFrequency?:   { [key: string]: number };
    [property: string]: any;
}

