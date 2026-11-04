import assert from 'node:assert/strict';
import test from 'node:test';

import { findAssistantMessageStarts } from '../src/providers/chatgptMessageBoundaries.ts';

const child = (tagName, text, sourceMessageId = null) => ({ tagName, text, sourceMessageId });

test('splits a scheduled answer appended after the original answer wrapper', () => {
    const children = [
        child('DIV', 'A1 response with numbered sections', 'original-message'),
        child('H1', '2026-11-04 线上竞赛与挑战日报'),
        child('H2', '一、今天最重要的变化'),
        child('H1', '二、日期窗口'),
    ];
    assert.deepEqual(findAssistantMessageStarts(children, [
        'original-message', 'original-message', 'scheduled-message',
    ]), [0, 1]);
});

test('separates later dated reports without splitting their chapters', () => {
    const children = [
        child('DIV', 'A1', 'original-message'),
        child('H1', '2026-11-04 日报'),
        child('H1', '一、今日变化'),
        child('H1', '2026-11-04 当日赛事'),
        child('H1', '2026-11-05 日报'),
        child('H1', '二、日期窗口'),
    ];
    assert.deepEqual(findAssistantMessageStarts(children, [
        'original-message', 'scheduled-message-1', 'scheduled-message-2',
    ]), [0, 1, 4]);
});

test('keeps ordinary single-message answers intact', () => {
    const children = [
        child('DIV', 'A1', 'original-message'),
        child('H1', '2026-11-04 日报'),
    ];
    assert.deepEqual(findAssistantMessageStarts(children, [
        'original-message', 'original-message',
    ]), [0]);
});
