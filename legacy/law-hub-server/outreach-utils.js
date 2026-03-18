const { getBusinessDateString, isDateOnOrBefore } = require('./date-utils');

function computeFollowupDate(days, now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + Math.max(0, Number(days || 0)));
  return getBusinessDateString(date);
}

function resolveReplyOutcome({ recommendedAction, escalateToHuman }) {
  if (escalateToHuman) return 'HANDOFF_TO_HUMAN';
  switch (recommendedAction) {
    case 'MOVE_TO_MEETING':
      return 'MEETING_INTENT_DETECTED';
    case 'CLOSE_RESPECTFULLY':
      return 'CLOSED_NO_INTEREST';
    case 'FOLLOW_UP_LATER':
      return 'FOLLOWUP_PENDING';
    default:
      return 'LEAD_REPLIED';
  }
}

function scoreOutreachQueue(record, now = new Date()) {
  if (!record) return -999;
  let score = Number(record.leadScore || 0);
  const stateBoost = {
    HANDOFF_TO_HUMAN: 45,
    MEETING_INTENT_DETECTED: 40,
    FOLLOWUP_PENDING: 28,
    LEAD_REPLIED: 24,
    CONNECTION_ACCEPTED: 20,
    CONNECTION_NOTE_PENDING: 16,
    FIRST_MESSAGE_PENDING: 14,
    QUALIFIED: 10,
  };
  score += stateBoost[record.state] || 0;
  if (record.escalateToHuman) score += 20;
  if ((record.tags || []).includes('meeting_signal')) score += 18;
  if ((record.tags || []).includes('warm_lead')) score += 12;
  if (record.followupDueDate) {
    if (isDateOnOrBefore(record.followupDueDate, getBusinessDateString(now))) score += 22;
  }
  return score;
}

function shouldBlockOutreach(fitClassification) {
  return ['DO_NOT_CONTACT', 'LOW_FIT'].includes(fitClassification);
}

module.exports = {
  computeFollowupDate,
  resolveReplyOutcome,
  scoreOutreachQueue,
  shouldBlockOutreach,
};
