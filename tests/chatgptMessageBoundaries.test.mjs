import assert from 'node:assert/strict';
import test from 'node:test';

import { findAssistantMessageStarts, getDatedTitleDate } from '../src/providers/chatgptMessageBoundaries.ts';

const child = (tagName, text, sourceMessageId = null) => ({ tagName, text, sourceMessageId });

test('recognizes the reported radar title as a dated message title', () => {
    assert.equal(
        getDatedTitleDate('2026-11-14 数学研究与学习雷达｜早间完整｜截至 03:04（UTC+8）'),
        '2026-11-14'
    );
    assert.equal(getDatedTitleDate('2026-11-14'), null);
});

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
        child('DIV', 'A1 response with enough context before the scheduled report', 'original-message'),
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

test('splits a dated report even when message IDs are unavailable', () => {
    const children = [
        child('DIV', 'AFP is already within the scheduled task scope, with this explanation from the previous answer.'),
        child('H1', '2026-11-14 数学研究与学习雷达｜早间完整｜截至 03:04（UTC+8）'),
    ];
    assert.deepEqual(findAssistantMessageStarts(children, []), [0, 1]);
});

test('keeps a standalone scheduled answer intact', () => {
    const children = [
        child('H1', '2026-11-04 日报'),
        child('H2', '一、今日变化'),
    ];
    assert.deepEqual(findAssistantMessageStarts(children, []), [0]);
});
