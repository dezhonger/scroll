export type CapturedTurn = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    headings?: string[];
};

export type ExportBlock = {
    kind?: 'exchange' | 'assistant-initiated';
    title?: string;
    prompt?: string;
    answer?: string;
    headings?: string[];
};
