/*!
 * Copyright (c) 2020-2024 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import {
  createList,
  createCredential as createListCredential
} from '@digitalbazaar/vc-bitstring-status-list';
import {
  createList as createList2021,
  createCredential as createList2021Credential
} from '@digitalbazaar/vc-status-list';
import assert from 'assert-plus';
import {issue} from './issue.js';
import {LIST_TYPE_TO_ENTRY_TYPE} from './constants.js';
import {LruCache} from '@digitalbazaar/lru-memoize';

const {util: {BedrockError}} = bedrock;

const COLLECTION_NAME = 'vc-status-slc';
let SLC_CACHE;

bedrock.events.on('bedrock.init', () => {
  const cfg = bedrock.config['vc-status'];
  SLC_CACHE = new LruCache(cfg.caches.slc);
});

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections([COLLECTION_NAME]);

  await database.createIndexes([{
    // collection for SLCs, indexed by status list ID
    collection: COLLECTION_NAME,
    fields: {statusListId: 1},
    options: {unique: true, background: false}
  }]);
});

/**
 * Creates a new status list credential with the given attributes.
 *
 * @param {object} options - The options to use.
 * @param {object} options.config - The status instance config.
 * @param {string} options.statusListId - The ID of the status list.
 * @param {string} options.indexAllocator - An unambiguous identifier for
 *   index allocation state; this must be provided whenever setting the
 *   status of a VC for the first time on the created status list.
 * @param {string} options.credentialId - The ID of the status list credential.
 * @param {string} options.type - The type of status list credential.
 * @param {string} options.statusPurpose - The status purpose.
 * @param {number} options.length - The length of the status list in bits.
 *
 * @returns {Promise<object>} Settles once the operation completes.
 */
export async function create({
  config, statusListId, indexAllocator,
  credentialId, type, statusPurpose, length
} = {}) {
  if(!LIST_TYPE_TO_ENTRY_TYPE.has(type)) {
    throw new BedrockError(
      `Status list type "${type}" is not supported by this status instance.`, {
        name: 'NotSupportedError',
        details: {
          httpStatusCode: 400,
          public: true
        }
      });
  }
  /* Note: `statusListId` does not need to equal `credentialId`, but it does
  need to share the same suffix (after the route prefix). This allows for
  redirection/proxy services to be used but allows local lookups in a status
  instance when only the `credentialId` is known. */
  // ensure `statusListId` suffix matches `credentialId` suffix
  const suffix = statusListId.slice(config.id.length);
  if(!credentialId.endsWith(suffix)) {
    throw new BedrockError(
      `Credential ID must end in status list suffix ("${suffix}").`, {
        name: 'DataError',
        details: {
          httpStatusCode: 400,
          public: true
        }
      });
  }
  let credential;
  if(type === 'BitstringStatusList') {
    const list = await createList({length});
    credential = await createListCredential({
      id: credentialId, list, statusPurpose
    });
  } else {
    // `type` must be `StatusList2021`
    const list = await createList2021({length});
    credential = await createList2021Credential({
      id: credentialId, list, statusPurpose
    });
  }
  credential.name = 'Status List Credential';
  credential.description =
    `This credential expresses status information for some ` +
    'other credentials in an encoded and compressed list.';
  credential = await issue({config, credential});
  await set({statusListId, indexAllocator, credential, sequence: 0});
  return {statusListId, indexAllocator, credential};
}

/**
 * Stores a status list credential if the given `sequence` is one more than the
 * given currently stored matching credential (or if there is no currently
 * stored credential matching the given status list ID and credential ID).
 *
 * @param {object} options - The options to use.
 * @param {string} options.statusListId - The ID of the status list.
 * @param {string} options.indexAllocator - An unambiguous identifier for
 *   index allocation state; this must be provided whenever setting the
 *   status of a VC for the first time on a status list.
 * @param {object} options.credential - The status list credential.
 * @param {number} options.sequence - The sequence number associated with the
 *   credential; used to ensure only newer versions of the credential are
 *   stored.
 *
 * @returns {Promise<object>} Settles once the operation completes.
 */
export async function set({
  statusListId, indexAllocator, credential, sequence
} = {}) {
  assert.string(statusListId, 'statusListId');
  assert.string(indexAllocator, 'indexAllocator');
  assert.object(credential, 'credential');
  assert.number(sequence, 'sequence');

  try {
    const collection = database.collections[COLLECTION_NAME];
    const now = Date.now();
    const $set = {credential, 'meta.updated': now, 'meta.sequence': sequence};
    const result = await collection.updateOne({
      statusListId,
      'meta.sequence': sequence === 0 ? null : sequence - 1
    }, {
      $set,
      $setOnInsert: {statusListId, indexAllocator, 'meta.created': now}
    }, {upsert: true});

    if(result.result.n > 0) {
      // document upserted or modified: success; clear cache
      SLC_CACHE.delete(statusListId);
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
 * Gets the status list credential for the given status list.
 *
 * @param {object} options - The options to use.
 * @param {string} options.statusListId - The ID of the status list.
 * @param {boolean} [options.useCache=true] - `true` to use the cache, false
 *   not to.
 *
 * @returns {Promise<object>} Resolves to the stored record.
 */
export async function get({statusListId, useCache = true} = {}) {
  assert.string(statusListId, 'statusListId');
  assert.bool(useCache, 'useCache');

  const fn = () => _getUncachedRecord({statusListId});
  if(useCache) {
    return SLC_CACHE.memoize({key: statusListId, fn});
  }
  return fn();
}

/**
 * Gets the credential for the given status list ID, refreshing it if it has
 * expired.
 *
 * @param {object} options - The options to use.
 * @param {object} options.config - The status instance config.
 * @param {string} options.statusListId - The ID of the status list.
 *
 * @returns {Promise<object>} Resolves to the stored record.
 */
export async function getFresh({config, statusListId} = {}) {
  assert.object(config, 'config');
  assert.string(statusListId, 'statusListId');

  const record = await get({statusListId});
  // check for expired SLC; get `now` as a minute into the future to ensure
  // any refreshed VC is still valid once returned to the client
  const now = new Date();
  now.setTime(now.getTime() + 1000 * 60);
  const validUntil = new Date(
    record.credential.validUntil ||
    record.credential.expirationDate);
  if(now <= validUntil) {
    // SLC not expired
    return {credential: record.credential};
  }
  // refresh SLC
  const doc = await refresh({config, statusListId});
  return {credential: doc.content};
}

/**
 * Refreshes the status list credential for a status list, if a newer version
 * (since the time at which this function was called) has not already been set.
 *
 * @param {object} options - The options to use.
 * @param {object} options.config - The status instance config.
 * @param {string} options.statusListId - The ID of the status list.
 *
 * @returns {Promise<object>} Settles once the operation completes.
 */
export async function refresh({config, statusListId} = {}) {
  assert.object(config, 'config');
  assert.string(statusListId, 'statusListId');

  const record = await get({statusListId, useCache: false});
  let {credential} = record;

  try {
    // reissue SLC
    credential = await issue({config, credential});

    // set updated SLC
    await set({
      statusListId, indexAllocator: record.indexAllocator,
      credential, sequence: record.meta.sequence + 1
    });

    return {credential};
  } catch(e) {
    if(e.name !== 'InvalidStateError') {
      throw e;
    }
    // ignore conflict; SLC was concurrently updated, just ensure cache is
    // cleared
    SLC_CACHE.delete(statusListId);
    ({credential} = await get({statusListId}));
    return {credential};
  }
}

async function _getUncachedRecord({statusListId}) {
  const collection = database.collections[COLLECTION_NAME];
  const record = await collection.findOne(
    {statusListId},
    {projection: {
      _id: 0, statusListId: 1, indexAllocator: 1, credential: 1, meta: 1
    }});
  if(!record) {
    throw new BedrockError(
      'Status list credential not found.', {
        name: 'NotFoundError',
        details: {
          statusListId,
          httpStatusCode: 404,
          public: true
        }
      });
  }
  return record;
}
