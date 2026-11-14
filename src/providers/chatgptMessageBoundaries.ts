export type AssistantContentChild = {
    sourceMessageId: string | null;
    tagName: string;
    text: string;
};

const DATED_TITLE = /^(20\d{2})(?:[-/.](\d{1,2})[-/.](\d{1,2})|\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日)(?:\s|[｜|:：—-]|$)/;

export const getDatedTitleDate = (text: string): string | null => {
    const match = text.trim().match(DATED_TITLE);
    if (!match) return null;
    if (text.trim().slice(match[0].length).trim().length < 2) return null;
    const month = Number(match[2] || match[4]);
    const day = Number(match[3] || match[5]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** Find direct-child message starts; dated titles also work without search metadata. */
export const findAssistantMessageStarts = (
    children: AssistantContentChild[],
    messageIds: string[]
): number[] => {
    if (children.length < 2) return [0];
    const distinctMessageCount = new Set(messageIds).size;
    const wrappedPreviousMessage = Boolean(children[0].sourceMessageId && !children[1].sourceMessageId);
    const starts = [0];
    if (wrappedPreviousMessage && distinctMessageCount > 1) starts.push(1);

    let lastDate = children[0].tagName === 'H1' ? getDatedTitleDate(children[0].text) : null;
    for (let index = 1; index < children.length; index += 1) {
        const child = children[index];
        const date = child.tagName === 'H1' ? getDatedTitleDate(child.text) : null;
        if (date && (!lastDate || date > lastDate) && children[0].text.trim().length >= 30) {
            if (!starts.includes(index)) starts.push(index);
            lastDate = date;
        }
    }
    return starts;
};
