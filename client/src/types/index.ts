export interface User {
    id: string;
    email: string;
    fullName?: string;
    imageUrl?: string;
    name?: string;
    image?: string;
}

export type Role = "user" | "assistant";

export type DeviceType = "phone" | "tablet" | "desktop";

/** Style fields the injected preview script reports and EditorPanel edits. */
export interface SelectedElementStyles {
    padding: string;
    margin: string;
    backgroundColor: string;
    color: string;
    fontSize: string;
}

/** Payload of the ELEMENT_SELECTED message posted by iframeScript. */
export interface SelectedElement {
    tagName: string;
    className: string;
    text: string;
    styles: SelectedElementStyles;
}

/** Payload of the UPDATE_ELEMENT message posted back into the iframe. */
export interface ElementUpdate {
    text?: string;
    className?: string;
    styles?: Partial<SelectedElementStyles>;
}

export interface Message {
    id: string;
    role: Role;
    content: string;
    timestamp: string;
}

export interface Version {
    id: string;
    timestamp: string;
    description?: string | null;
    /** Omitted by list endpoints — only /api/project/preview returns code. */
    code?: string;
}

/**
 * Lifecycle of the project's DOCUMENT, not of the last request. A failed
 * revision returns to `ready` because the previous document is still usable.
 *
 * Optional on Project because a newly deployed client can briefly talk to an
 * API that predates the column; Projects.tsx falls back to the legacy signals.
 */
export type GenerationStatus = "pending" | "generating" | "ready" | "failed";

export type GenerationPhase = "queued" | "enhancing" | "generating" | "saving";

export type GenerationKind = "initial" | "revision";

/** Mirrors StreamEvent in server/lib/generationStream.ts — keep in sync. */
export type StreamEvent =
    | { type: "snapshot"; kind: GenerationKind; phase: GenerationPhase; text: string; bytes: number; truncated: boolean }
    | { type: "delta"; text: string; bytes: number; truncated: boolean }
    | { type: "status"; kind: GenerationKind; phase: GenerationPhase; bytes: number }
    | { type: "done"; status: "ready" }
    | { type: "failed"; status: "failed" | "ready"; message: string };

/**
 * Live generation view state. COSMETIC ONLY — never saved, never downloaded.
 * The DB is the only source of truth, which is what makes a dropped frame or a
 * truncated buffer ugly rather than corrupting.
 */
export interface StreamState {
    text: string;
    phase: GenerationPhase;
    bytes: number;
    truncated: boolean;
    connected: boolean;
}

export type BuilderTab = "preview" | "code";

/**
 * An HTML snapshot tagged with the project code it was derived from.
 *
 * It is STALE — and must be ignored — as soon as project.current_code differs.
 * That value comparison is how an AI revision, a rollback or a save
 * auto-invalidates local edits during render, without an effect (the React
 * Compiler lint rules make `set-state-in-effect` an error).
 */
export interface CodeSnapshot {
    basedOn: string | null;
    html: string;
}

/** The code-editor buffer. `html !== pristine` is the dirty state. */
export interface CodeDraft extends CodeSnapshot {
    pristine: string;
}

export interface Project {
    id: string;
    name: string;
    initial_prompt: string;
    /** null until the background generation finishes. */
    current_code: string | null;
    createdAt: string;
    updatedAt: string;
    userId: string;
    user?: User;
    isPublished?: boolean;
    versionId?: string;
    conversation: Message[];
    versions: Version[];
    current_version_index: string;
    status?: GenerationStatus;
}
