/*!
 * Copyright (c) 2020-2024 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import * as mappings from './mappings.js';
import {
  createList as createList2021,
  createCredential as createSlc
} from '@digitalbazaar/vc-status-list';
import assert from 'assert-plus';
import {decodeList} from '@digitalbazaar/vc-status-list';
import {issue} from './issue.js';
import {LruCache} from '@digitalbazaar/lru-memoize';

const {util: {BedrockError}} = bedrock;

const COLLECTION_NAME = 'vc-status-publishedSlc';
let SLC_CACHE;

// matching status list type => status entry type
const LIST_TYPE_TO_ENTRY_TYPE = new Map([
  ['BitstringStatusList', 'BitstringStatusListEntry'],
  // FIXME: remove support for deprecated status list types
  ['StatusList2021', 'StatusList2021Entry']
]);

bedrock.events.on('bedrock.init', () => {
  const cfg = bedrock.config['vc-status'];
  SLC_CACHE = new LruCache(cfg.caches.slc);
});

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections([COLLECTION_NAME]);

  await database.createIndexes([{
    // collection for SLCs, not the VCs it tracks status for
    collection: COLLECTION_NAME,
    // this index needs to include the status instance config ID to prevent
    // conflicts in SLCs amongst multiple status instances, each that might
    // have different authz
    fields: {configId: 1, 'credential.id': 1},
    options: {unique: true, background: false}
  }]);
});

/**
 * Creates a new status list credential with the given ID and other attributes.
 *
 * @param {object} options - The options to use.
 * @param {object} options.config - The status instance config.
 * @param {string} options.id - The ID of the status list credential.
 * @param {string} options.type - The type of status list credential.
 * @param {string} options.statusPurpose - The status purpose.
 * @param {number} options.length - The length of the status list in bits.
 *
 * @returns {Promise<object>} Settles once the operation completes.
 */
export async function create({config, id, type, statusPurpose, length} = {}) {
  if(!LIST_TYPE_TO_ENTRY_TYPE.has(type)) {
    throw new BedrockError(
      `Credential status type "${type}" is not supported by this ` +
      'issuer instance.', {
        name: 'NotSupportedError',
        details: {
          httpStatusCode: 400,
          public: true
        }
      });
  }
  // FIXME: implement `BitstringStatusList`
  // assume `StatusList2021`
  const list = await createList2021({length});
  // FIXME: handle `statusPurpose` as an array (not just a single value)
  let credential = await createSlc({id, list, statusPurpose});
  credential.name = 'Status List Credential';
  credential.description =
    `This credential expresses status information for some ` +
    'other credentials in an encoded and compressed list.';
  credential = await issue({config, credential});
  return set({configId: config.id, credential, sequence: 0});
}

/**
 * Sets a published status list credential for the given status instance if
 * the given `sequence` is one more than the given currently stored
 * credential (or if there is no currently stored credential matching the
 * given status list credential ID).
 *
 * @param {object} options - The options to use.
 * @param {string} options.configId - The ID of the status instance config.
 * @param {string} options.credential - The credential.
 * @param {number} options.sequence - The sequence number associated with the
 *   credential; used to ensure only newer versions of the credential are
 *   stored.
 *
 * @returns {Promise<object>} Settles once the operation completes.
 */
export async function set({configId, credential, sequence} = {}) {
  assert.string(configId, 'configId');
  assert.object(credential, 'credential');
  assert.number(sequence, 'sequence');

  try {
    const collection = database.collections[COLLECTION_NAME];
    const now = Date.now();
    const $set = {credential, 'meta.updated': now, 'meta.sequence': sequence};
    const result = await collection.updateOne({
      configId,
      'credential.id': credential.id,
      'meta.sequence': sequence === 0 ? null : sequence - 1
    }, {
      $set,
      $setOnInsert: {'meta.created': now}
    }, {upsert: true});

    if(result.result.n > 0) {
      // document upserted or modified: success; clear cache
      const key = _getSlcCacheKey({configId, id: credential.id});
      SLC_CACHE.delete(key);
      return true;
    }
  } catch(e) {
    if(!database.isDuplicateError(e)) {
      throw e;
    }
    // ignore duplicate error, it means sequence did not match as below
  }

  throw new BedrockError(
    'Could not update status list credential. Sequence is stale.',
    'InvalidStateError', {
      httpStatusCode: 409,
      public: true,
      sequence
    });
}

/**
 * Gets a published credential for the given status instance.
 *
 * @param {object} options - The options to use.
 * @param {string} options.configId - The ID of the status instance config.
 * @param {string} options.id - The ID of the status list credential.
 * @param {boolean} [options.useCache=true] - `true` to use the cache, false
 *   not to.
 *
 * @returns {Promise<object>} Resolves to the stored record.
 */
export async function get({configId, id, useCache = true} = {}) {
  assert.string(configId, 'configId');
  assert.string(id, 'id');
  assert.bool(useCache, 'useCache');

  const fn = () => _getUncachedRecord({configId, id});
  if(useCache) {
    const key = _getSlcCacheKey({configId, id});
    return SLC_CACHE.memoize({key, fn});
  }
  return fn();
}

/**
 * Gets the published credential for the given status list credential ID,
 * refreshing it if it has expired or is not found.
 *
 * @param {object} options - The options to use.
 * @param {object} options.config - The status instance config.
 * @param {string} options.id - The ID of the status list credential.
 *
 * @returns {Promise<object>} Resolves to the stored record.
 */
export async function getFresh({config, id} = {}) {
  assert.object(config, 'config');
  assert.string(id, 'id');

  const record = await get({configId: config.id, id});
  // check for expired SLC; get `now` as a minute into the future to ensure
  // any refreshed VC is still valid once returned to the client
  const now = new Date();
  now.setTime(now.getTime() + 1000 * 60);
  // FIXME: support v2 VCs w/`validUntil`
  const validUntil = new Date(record.credential.expirationDate);
  if(now <= validUntil) {
    // SLC not expired
    return {credential: record.credential};
  }
  // refresh SLC
  console.log('***********AUTO REFRESH***********');
  const doc = await refresh({id, config});
  return {credential: doc.content};
}

/**
 * Refreshes the status list credential with the given ID for the given
 * status instance `config`, if a newer version (since the time at which this
 * function was called) has not already been published.
 *
 * @param {object} options - The options to use.
 * @param {object} options.config - The status instance config.
 * @param {string} options.id - The SLC ID.
 *
 * @returns {Promise<object>} Settles once the operation completes.
 */
export async function refresh({config, id} = {}) {
  assert.object(config, 'config');
  assert.string(id, 'id');

  const {id: configId} = config;
  const record = await get({configId, id, useCache: false});
  let {credential} = record;
  const key = _getSlcCacheKey({configId, id});

  try {
    // reissue SLC
    credential = await issue({config, credential});

    // set updated SLC
    await set({configId, credential, sequence: record.meta.sequence + 1});

    return {credential};
  } catch(e) {
    if(e.name !== 'InvalidStateError') {
      throw e;
    }
    // ignore conflict; SLC was concurrently updated, just ensure cache is
    // cleared
    SLC_CACHE.delete(key);
    ({credential} = await get({configId, id}));
    return {credential};
  }
}

export async function setStatus({config, id, credentialStatus, status} = {}) {
  assert.object(config, 'config');
  assert.string(id, 'id');
  assert.object(credentialStatus, 'credentialStatus');
  assert.bool(status, 'status');

  const {statusPurpose} = credentialStatus;
  let {statusListCredential, statusListIndex} = credentialStatus;
  const {id: configId} = config;

  // try to get an existing mapping
  let mapping;
  try {
    mapping = await mappings.get({configId, credentialId: id, statusPurpose});
  } catch(e) {
    if(e.name !== 'NotFoundError') {
      throw e;
    }
    // allow mapping to be not found
  }

  // if the mapping isn't found, then `statusListCredential` and
  // `statusListIndex` must be given
  if(!mapping && statusListIndex === undefined) {
    throw new BedrockError(
      `"credentialStatus.statusListCredential" and ` +
      `"credentialStatus.statusListIndex" must be provided because the ` +
      `status "${statusPurpose}" for credential "${id}" has not been set yet.`,
      'DataError', {
        httpStatusCode: 400,
        public: true
      });
  }

  if(mapping) {
    // assert mapping matches expected values
    if(statusListCredential !== undefined &&
      mapping.statusListCredential !== statusListCredential) {
      throw new BedrockError(
        `"credentialStatus.statusListCredential" (${statusListCredential}) ` +
        `does not match the expected value (${mapping.statusListCredential}).`,
        'DataError', {
          actual: statusListCredential,
          expected: mapping.statusListCredential,
          httpStatusCode: 400,
          public: true
        });
    }
    if(statusListIndex !== undefined &&
      mapping.statusListIndex !== statusListIndex) {
      throw new BedrockError(
        `"credentialStatus.statusListIndex" (${statusListIndex}) ` +
        `does not match the expected value (${mapping.statusListIndex}).`,
        'DataError', {
          actual: statusListIndex,
          expected: mapping.statusListIndex,
          httpStatusCode: 400,
          public: true
        });
    }
    statusListCredential = mapping.statusListCredential;
    statusListIndex = mapping.statusListIndex;
  }

  // ensure status list VC matches expectation
  let record = await get({configId, id: statusListCredential, useCache: false});
  _assertStatusListMatch({slc: record.credential, credentialStatus});

  if(!mapping) {
    // add new mapping
    await mappings.set({
      configId,
      credentialId: id, statusPurpose, statusListCredential, statusListIndex
    });
  }

  // express get bitstring index
  const bitstringIndex = parseInt(statusListIndex, 10);

  // update SLC
  while(true) {
    try {
      // check if `credential` status is already set, if so, done
      let {credential: slc} = record;
      const {credentialSubject: {encodedList}} = slc;
      const list = await decodeList({encodedList});
      if(list.getStatus(bitstringIndex) === status) {
        return;
      }

      // use index to set status
      list.setStatus(bitstringIndex, status);
      slc.credentialSubject.encodedList = await list.encode();

      // reissue SLC
      slc = await issue({config, credential: slc});

      // update SLC
      await set({
        configId, credential: slc, sequence: record.meta.sequence + 1
      });
      return;
    } catch(e) {
      if(e.name !== 'InvalidStateError') {
        throw e;
      }
      // ignore conflict, read and try again
      record = await get({configId, id: statusListCredential, useCache: false});
    }
  }
}

function _assertStatusListMatch({slc, credentialStatus} = {}) {
  // return match against `meta.credentialStatus` where the status entry
  // type and status purpose match
  const expectedType = LIST_TYPE_TO_ENTRY_TYPE.get(slc.type);
  if(expectedType === credentialStatus.type) {
    throw new BedrockError(
      `"credentialStatus.type" (${credentialStatus.type}) ` +
      `does not match the expected value (${expectedType}).`,
      'DataError', {
        actual: credentialStatus.type,
        expected: expectedType,
        httpStatusCode: 400,
        public: true
      });
  }
}

async function _getUncachedRecord({configId, id}) {
  const collection = database.collections[COLLECTION_NAME];
  const record = await collection.findOne({
    configId,
    'credential.id': id
  }, {projection: {_id: 0, configId: 1, credential: 1, meta: 1}});
  if(!record) {
    throw new BedrockError(
      'Status list credential not found.', {
        name: 'NotFoundError',
        details: {
          statusListCredential: id,
          httpStatusCode: 404,
          public: true
        }
      });
  }
  return record;
}

function _getSlcCacheKey({configId, id}) {
  return JSON.stringify([configId, id]);
}
