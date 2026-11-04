export type AssistantContentChild = {
    sourceMessageId: string | null;
    tagName: string;
    text: string;
};

const DATED_TITLE = /^(20\d{2})(?:[-/.](\d{1,2})[-/.](\d{1,2})|\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日)(?:\s|[｜|:：—-]|$)/;

const getTitleDate = (text: string): string | null => {
    const match = text.trim().match(DATED_TITLE);
    if (!match) return null;
    const month = Number(match[2] || match[4]);
    const day = Number(match[3] || match[5]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** ChatGPT can append scheduled answers after a source-message wrapper. */
export const findAssistantMessageStarts = (
    children: AssistantContentChild[],
    messageIds: string[]
): number[] => {
    const distinctMessageCount = new Set(messageIds).size;
    if (children.length < 2 || distinctMessageCount < 2) return [0];
    if (!children[0].sourceMessageId || children[1].sourceMessageId) return [0];

    const starts = [0, 1];
    let lastDate = getTitleDate(children[1].text);
    for (let index = 2; index < children.length; index += 1) {
        const child = children[index];
        const date = child.tagName === 'H1' ? getTitleDate(child.text) : null;
        if (date && (!lastDate || date > lastDate) && starts.length < distinctMessageCount) {
            starts.push(index);
            lastDate = date;
        }
    }
    return starts;
};
