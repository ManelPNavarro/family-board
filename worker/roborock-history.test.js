import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { decodeHistoryReply } from './roborock-history.js';

test('Q7 history accepts a Python Roborock reply only for the matching request', () => {
  // Produced with python-roborock 7.33.0 using a synthetic device key and cleaning.
  const reply = Buffer.from([
    '423031000004d20000162e6b084986006600c0420de07b7488287d23aae9c51d81b622554dd2aa84dd938dc1d47c323d713d',
    'b00bce9366e8eee0126ffcb1e54d0c31a0be685155c7e0950659cf3ef7544c828a90c402510ff28085dd905c6611b5fcc0e',
    '35b61449df55829cbbd7a26e081212b324ea56e290eacf1d3dc99482122fe8c7a414cdf3902da65f719aae2a929a40c15a0',
    'dfbcac6e065b9b9dd80b59f8e1cdb66eeddcc6b2e5b4b9eb746db20e1e009e0c5dfdf33b79ed99e02a71edcea1e6e9c5',
    'f468e42ce32b4c75a8c20ad5416ec5d568ac',
  ].join(''), 'hex');
  const key = Buffer.from('0123456789abcdef');
  assert.deepEqual(decodeHistoryReply(reply, key, '123456789012').map(({ detail }) => JSON.parse(detail)), [
    { record_start_time: 1795705200, record_clean_area: 3870 },
  ]);
  assert.equal(decodeHistoryReply(reply, key, '123456789013'), null);
  reply[25] ^= 1;
  assert.equal(decodeHistoryReply(reply, key, '123456789012'), null);
});
