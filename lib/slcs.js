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
    // FIXME: determine if the index needs to include the status instance
    // config ID or if it's safe to omit that in the face of conflicts across
    // different instances
    fields: {'credential.id': 1},
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
  return set({credential, sequence: 0});
}

/**
 * Sets the published credential for the given status list credential ID
 * if the given `sequence` is one more than the given currently stored
 * credential (or if there is no currently stored credential).
 *
 * Note: This is the credential will be served when the ID endpoint is hit.
 *
 * @param {object} options - The options to use.
 * @param {string} options.credential - The credential.
 * @param {number} options.sequence - The sequence number associated with the
 *   credential; used to ensure only newer versions of the credential are
 *   stored.
 *
 * @returns {Promise<object>} Settles once the operation completes.
 */
export async function set({credential, sequence} = {}) {
  // FIXME: also require `config`
  assert.object(credential, 'credential');
  assert.number(sequence, 'sequence');

  try {
    const collection = database.collections[COLLECTION_NAME];
    const now = Date.now();
    const $set = {credential, 'meta.updated': now, 'meta.sequence': sequence};
    const result = await collection.updateOne({
      'credential.id': credential.id,
      'meta.sequence': sequence === 0 ? null : sequence - 1
    }, {
      $set,
      $setOnInsert: {'meta.created': now}
    }, {upsert: true});

    if(result.result.n > 0) {
      // document upserted or modified: success; clear cache
      SLC_CACHE.delete(credential.id);
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
 * Gets the published credential for the given status list credential ID.
 * This is the credential to be served when the ID endpoint is hit.
 *
 * @param {object} options - The options to use.
 * @param {string} options.id - The ID of the status list credential.
 * @param {boolean} [options.useCache=true] - `true` to use the cache, false
 *   not to.
 *
 * @returns {Promise<object>} Resolves to the stored record.
 */
export async function get({id, useCache = true} = {}) {
  assert.string(id, 'id');
  assert.bool(useCache, 'useCache');

  const fn = () => _getUncachedRecord({id});
  if(useCache) {
    return SLC_CACHE.memoize({key: id, fn});
  }
  return fn();
}

/**
 * Gets the published credential for the given status list credential ID,
 * refreshing it if it has expired or is not found.
 *
 * @param {object} options - The options to use.
 * @param {string} options.id - The ID of the status list credential.
 * @param {object} options.config - The status instance config.
 *
 * @returns {Promise<object>} Resolves to the stored record.
 */
export async function getFresh({id, config} = {}) {
  const record = await get({id});
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
 * Returns true if a status list credential has been stored and false if not.
 *
 * @param {object} options - The options to use.
 * @param {string} options.id - The ID of the status list credential.
 *
 * @returns {Promise<boolean>} Resolves to true if stored, false if not.
 */
export async function exists({id}) {
  assert.string(id, 'id');
  const collection = database.collections[COLLECTION_NAME];
  const record = await collection.findOne(
    {'credential.id': id}, {projection: {_id: 0, id: 1}});
  return !!record;
}

/**
 * Refreshes the status list credential with the given ID for the given
 * status instance `config`, if a newer version (since the time at which this
 * function was called) has not already been published.
 *
 * @param {object} options - The options to use.
 * @param {string} options.id - The SLC ID.
 * @param {object} options.config - The status instance config.
 *
 * @returns {Promise<object>} Settles once the operation completes.
 */
export async function refresh({id, config} = {}) {
  assert.string(id, 'id');
  assert.object(config, 'config');

  const record = await get({id, useCache: false});
  let {credential} = record;

  try {
    // reissue SLC
    credential = await issue({config, credential});

    // set updated SLC
    await set({credential, sequence: record.meta.sequence + 1});

    return {credential};
  } catch(e) {
    if(e.name !== 'InvalidStateError') {
      throw e;
    }
    // ignore conflict; SLC was concurrently updated, just ensure cache is
    // cleared
    SLC_CACHE.delete(credential.id);
    ({credential} = await get({id}));
    return {credential};
  }
}

export async function setStatus({id, config, credentialStatus, status} = {}) {
  assert.string(id, 'id');
  assert.object(config, 'config');
  assert.object(credentialStatus, 'credentialStatus');
  assert.bool(status, 'status');

  const {statusPurpose} = credentialStatus;
  let {statusListCredential, statusListIndex} = credentialStatus;

  // try to get an existing mapping
  let mapping;
  try {
    mapping = await mappings.get({credentialId: id, statusPurpose});
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
      mapping.slcId !== statusListCredential) {
      throw new BedrockError(
        `"credentialStatus.statusListCredential" (${statusListCredential}) ` +
        `does not match the expected value (${mapping.slcId}).`,
        'DataError', {
          actual: statusListCredential,
          expected: mapping.slcId,
          httpStatusCode: 400,
          public: true
        });
    }
    if(statusListIndex !== undefined &&
      mapping.slcId !== statusListIndex) {
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
  let record = await get({id: mapping.slcId, useCache: false});
  _assertStatusListMatch({slc: record.credential, credentialStatus});

  if(!mapping) {
    // add new mapping
    await mappings.set({
      credentialId: id, statusPurpose, slcId: statusListCredential,
      statusListIndex
    });
  }

  // update SLC
  while(true) {
    try {
      // check if `credential` status is already set, if so, done
      let {credential: slc} = record;
      const {credentialSubject: {encodedList}} = slc;
      const list = await decodeList({encodedList});
      if(list.getStatus(statusListIndex) === status) {
        return;
      }

      // use index to set status
      list.setStatus(statusListIndex, status);
      slc.credentialSubject.encodedList = await list.encode();

      // reissue SLC
      slc = await issue({config, credential: slc});

      // update SLC
      await set({credential: slc, sequence: record.meta.sequence + 1});
      return;
    } catch(e) {
      if(e.name !== 'InvalidStateError') {
        throw e;
      }
      // ignore conflict, read and try again
      record = await get({id: mapping.slcId, useCache: false});
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

async function _getUncachedRecord({id}) {
  const collection = database.collections[COLLECTION_NAME];
  const record = await collection.findOne(
    {'credential.id': id}, {projection: {_id: 0, credential: 1, meta: 1}});
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
