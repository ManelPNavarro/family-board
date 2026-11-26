import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import { connect } from 'node:tls';
import { crc32 } from 'node:zlib';
import mqttPacket from 'mqtt-packet';

const b01Version = 'B01';
const headerLength = 19;
const checksumLength = 4;
const ivSalt = '5wwh9ikChRjASpMU8cxg7o1d2E';

function md5(value) {
  return createHash('md5').update(value).digest('hex');
}

function frameIv(nonce) {
  return Buffer.from(md5(nonce.toString(16).padStart(8, '0') + ivSalt).slice(9, 25));
}

export function encodeRoborockRequest(localKey, requestId, method, params) {
  const header = Buffer.alloc(headerLength);
  header.write(b01Version);
  randomBytes(8).copy(header, 3);
  header.writeUInt32BE(Math.floor(Date.now() / 1000), 11);
  header.writeUInt16BE(101, 15);

  const body = Buffer.from(JSON.stringify({
    dps: { 10000: { method, msgId: requestId, params } },
  }));
  // Q7 pads the JSON payload as well as the AES transport envelope.
  const padding = 16 - body.length % 16;
  const cipher = createCipheriv('aes-128-cbc', localKey, frameIv(header.readUInt32BE(7)));
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([body, Buffer.alloc(padding, padding)])), cipher.final()]);
  header.writeUInt16BE(encrypted.length, 17);

  const frame = Buffer.concat([header, encrypted, Buffer.alloc(checksumLength)]);
  const checksumOffset = frame.length - checksumLength;
  frame.writeUInt32BE(crc32(frame.subarray(0, checksumOffset)), checksumOffset);
  return frame;
}

export function decodeRoborockReply(payload, localKey, requestId) {
  const offset = payload.indexOf(b01Version);
  if (offset < 0 || payload.length - offset < headerLength + checksumLength) return null;
  const frame = payload.subarray(offset);
  const checksumOffset = headerLength + frame.readUInt16BE(17);
  if (checksumOffset + checksumLength > frame.length ||
      crc32(frame.subarray(0, checksumOffset)) !== frame.readUInt32BE(checksumOffset)) return null;

  let datapoints;
  try {
    const decipher = createDecipheriv('aes-128-cbc', localKey, frameIv(frame.readUInt32BE(7)));
    let content = Buffer.concat([decipher.update(frame.subarray(headerLength, checksumOffset)), decipher.final()]);
    const padding = content.at(-1);
    if (padding >= 1 && padding <= 16 && content.subarray(-padding).every(byte => byte === padding)) {
      content = content.subarray(0, -padding);
    }
    datapoints = JSON.parse(content.toString('utf8')).dps;
  } catch {
    return null;
  }

  for (const entry of Object.values(datapoints ?? {})) {
    let reply = entry;
    if (typeof entry === 'string') {
      try {
        reply = JSON.parse(entry);
      } catch {
        continue;
      }
    }
    if (String(reply?.msgId) !== requestId) continue;
    if (Number(reply.code ?? 0) !== 0) {
      throw new Error('device_rejected');
    }
    return reply;
  }
  return null;
}

async function sendRoborockRequest(session, deviceKey, method, params) {
  const localKey = Buffer.from(deviceKey ?? '');
  if (localKey.length !== 16) throw new Error('device_key');

  const host = new URL(session.mqttBroker).hostname;
  const username = md5(`${session.user}:${session.mqttKey}`).slice(2, 10);
  const password = md5(`${session.secret}:${session.mqttKey}`).slice(16);
  const deviceTopic = `${session.user}/${username}/${session.deviceId}`;
  const receiveTopic = `rr/m/o/${deviceTopic}`;
  const requestId = String(randomInt(100_000_000_000, 1_000_000_000_000));
  const payload = encodeRoborockRequest(localKey, requestId, method, params);

  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: 8883, servername: host });
    const parser = mqttPacket.parser();
    const send = (packet) => socket.write(mqttPacket.generate(packet));
    let stage = 'tls';
    let bytesReceived = 0;
    const timeout = setTimeout(() => fail(stage), 9000);

    function close() {
      clearTimeout(timeout);
      socket.destroy();
    }

    function fail(reason) {
      reject(new Error(reason));
      close();
    }

    socket.once('secureConnect', () => {
      stage = 'mqtt_login';
      send({
        cmd: 'connect', protocolId: 'MQTT', protocolVersion: 4, clean: true, keepalive: 15,
        clientId: `fb-${randomBytes(8).toString('hex')}`, username, password,
      });
    });
    socket.on('error', () => fail(stage));
    socket.once('end', () => fail(stage));
    socket.on('data', (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived > 512 * 1024) return fail('response_size');
      try {
        parser.parse(chunk);
      } catch {
        fail('response_format');
      }
    });
    parser.on('error', () => fail('response_format'));
    parser.on('packet', (packet) => {
      if (packet.cmd === 'connack' && stage === 'mqtt_login') {
        if (packet.returnCode !== 0) return fail(stage);
        stage = 'mqtt_subscribe';
        send({ cmd: 'subscribe', messageId: 1, subscriptions: [{ topic: receiveTopic, qos: 0 }] });
      } else if (packet.cmd === 'suback' && stage === 'mqtt_subscribe') {
        if (packet.messageId !== 1 || packet.granted[0] !== 0) return fail(stage);
        stage = 'device_reply';
        send({ cmd: 'publish', topic: `rr/m/i/${deviceTopic}`, payload, qos: 0 });
      } else if (packet.cmd === 'publish' && packet.topic === receiveTopic && stage === 'device_reply') {
        try {
          const reply = decodeRoborockReply(packet.payload, localKey, requestId);
          if (reply !== null) {
            resolve(reply.data);
            close();
          }
        } catch {
          fail('device_rejected');
        }
      }
    });
  });
}

export async function readCleaningHistory(session, deviceKey) {
  const data = await sendRoborockRequest(session, deviceKey, 'service.get_record_list', {});
  if (!Array.isArray(data?.record_list)) throw new Error('response_format');
  return data.record_list;
}

export async function startFullCleaning(session, deviceKey) {
  // Full cleaning with the robot's current settings.
  await sendRoborockRequest(session, deviceKey, 'service.set_room_clean', {
    clean_type: 0,
    ctrl_value: 1,
    room_ids: [],
  });
}
