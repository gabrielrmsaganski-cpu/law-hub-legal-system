const assert = require('node:assert/strict');

const {
  getBusinessDateString,
  compareDateOnly,
  isDateBefore,
  isDateOnOrBefore,
} = require('./date-utils');

function run() {
  assert.equal(getBusinessDateString(new Date('2026-03-11T02:30:00Z')), '2026-03-10');
  assert.equal(compareDateOnly('2026-03-10', '2026-03-11'), -1);
  assert.equal(compareDateOnly('2026-03-11', '2026-03-11'), 0);
  assert.equal(isDateBefore('2026-03-10', '2026-03-11'), true);
  assert.equal(isDateBefore('2026-03-11', '2026-03-11'), false);
  assert.equal(isDateOnOrBefore('2026-03-11', '2026-03-11'), true);

  console.log('date-utils tests passed');
}

run();
