/*!
 * Copyright (c) 2020-2024 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import assert from 'assert-plus';

const {util: {BedrockError}} = bedrock;

const COLLECTION_NAME = 'vc-status-vcToSlc';

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await database.openCollections([COLLECTION_NAME]);

  await database.createIndexes([{
    collection: COLLECTION_NAME,
    // FIXME: determine if the index needs to include the status instance
    // config ID or if it's safe to omit that in the face of conflicts across
    // different instances
    fields: {'mapping.credentialId': 1, 'mapping.statusPurpose': 1},
    options: {unique: true, background: false}
  }]);
});

/**
 * Sets a mapping from a VC and a status purpose to a status list credential.
 *
 * @param {object} options - The options to use.
 * @param {string} options.credentialId - The credential ID.
 * @param {string} options.statusPurpose - The status purpose.
 * @param {string} options.slcId - The status list credential ID.
 * @param {string} options.statusListIndex - The status list index.
 * @param {number} [options.sequence=0] - The sequence for updating an existing
 *   mapping.
 *
 * @returns {Promise<object>} Settles once the operation completes.
 */
export async function set({
  credentialId, statusPurpose, slcId, statusListIndex, sequence = 0
} = {}) {
  assert.string(credentialId, 'credentialId');
  assert.string(statusPurpose, 'statusPurpose');
  assert.string(slcId, 'slcId');
  assert.string(statusListIndex, 'statusListIndex');
  assert.number(sequence, 'sequence');

  try {
    const collection = database.collections[COLLECTION_NAME];
    const now = Date.now();
    const $set = {
      mapping: {},
      'meta.updated': now,
      'meta.sequence': sequence
    };
    const result = await collection.updateOne({
      'mapping.credentialId': credentialId,
      'mapping.statusPurpose': statusPurpose,
      'mapping.slcId': slcId,
      'mapping.statusListIndex': statusListIndex,
      'meta.sequence': sequence === 0 ? null : sequence - 1
    }, {
      $set,
      $setOnInsert: {'meta.created': now}
    }, {upsert: true});

    if(result.result.n > 0) {
      // document upserted or modified
      return true;
    }
  } catch(e) {
    if(!database.isDuplicateError(e)) {
      throw e;
    }
    // ignore duplicate error, it means sequence did not match as below
  }

  throw new BedrockError(
    'Could not update status list credential mapping. Sequence is stale.',
    'InvalidStateError', {
      httpStatusCode: 409,
      public: true,
      sequence
    });
}

/**
 * Gets the SLC mapping for the given credential ID.
 *
 * @param {object} options - The options to use.
 * @param {string} options.credentialId - The ID of the credential.
 * @param {string} options.statusPurpose - The status purpose.
 *
 * @returns {Promise<object>} Resolves to the stored record.
 */
export async function get({credentialId, statusPurpose} = {}) {
  assert.string(credentialId, 'credentialId');
  assert.string(statusPurpose, 'statusPurpose');

  const collection = database.collections[COLLECTION_NAME];
  const record = await collection.findOne({
    'mapping.credentialId': credentialId,
    'mapping.statusPurpose': statusPurpose,
  }, {projection: {_id: 0, mapping: 1, meta: 1}});
  if(!record) {
    throw new BedrockError(
      'Status list credential mapping not found.',
      'NotFoundError', {
        credentialId,
        statusPurpose,
        httpStatusCode: 404,
        public: true
      });
  }
  return record;
}
