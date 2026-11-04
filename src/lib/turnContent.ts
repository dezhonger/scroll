import { Turn } from '../types';
import { serializeNodeToMarkdown } from './markdownUtil';

export const serializeTurnToMarkdown = (turn: Turn): string => {
    if (!turn.contentRange) return serializeNodeToMarkdown(turn.element);
    const wrapper = turn.element.ownerDocument.createElement('div');
    wrapper.appendChild(turn.contentRange.cloneContents());
    return serializeNodeToMarkdown(wrapper);
};

export const getTurnPlainText = (turn: Turn): string =>
    turn.contentRange ? (turn.text || turn.contentRange.toString().trim())
        : (turn.element.innerText?.trim() || turn.text);

export const getTurnRect = (turn: Turn): DOMRect =>
    turn.contentRange?.getBoundingClientRect() || turn.element.getBoundingClientRect();
