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
}
