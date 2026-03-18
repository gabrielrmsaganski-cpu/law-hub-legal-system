const assert = require('node:assert/strict');

const {
  computeFollowupDate,
  resolveReplyOutcome,
  scoreOutreachQueue,
  shouldBlockOutreach,
} = require('./outreach-utils');

function run() {
  assert.equal(computeFollowupDate(4, new Date('2026-03-10T12:00:00Z')), '2026-03-14');
  assert.equal(resolveReplyOutcome({ recommendedAction: 'ANSWER_AND_ADVANCE', escalateToHuman: true }), 'HANDOFF_TO_HUMAN');
  assert.equal(resolveReplyOutcome({ recommendedAction: 'MOVE_TO_MEETING', escalateToHuman: false }), 'MEETING_INTENT_DETECTED');
  assert.equal(resolveReplyOutcome({ recommendedAction: 'FOLLOW_UP_LATER', escalateToHuman: false }), 'FOLLOWUP_PENDING');

  const base = scoreOutreachQueue({
    leadScore: 70,
    state: 'QUALIFIED',
    tags: [],
    escalateToHuman: false,
  }, new Date('2026-03-10T12:00:00Z'));

  const urgent = scoreOutreachQueue({
    leadScore: 70,
    state: 'FOLLOWUP_PENDING',
    tags: ['meeting_signal'],
    escalateToHuman: true,
    followupDueDate: '2026-03-10',
  }, new Date('2026-03-10T12:00:00Z'));

  assert.ok(urgent > base);
  assert.equal(shouldBlockOutreach('LOW_FIT'), true);
  assert.equal(shouldBlockOutreach('DO_NOT_CONTACT'), true);
  assert.equal(shouldBlockOutreach('MEDIUM_FIT'), false);

  console.log('outreach-utils tests passed');
}

run();
