/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
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
    // this index needs to include the status instance config ID to prevent
    // conflicts in mappings amongst multiple status instances, each that might
    // have different authz
    fields: {
      'mapping.configId': 1,
      'mapping.credentialId': 1,
      'mapping.statusPurpose': 1
    },
    options: {unique: true, background: false}
  }]);
});

/**
 * Sets a mapping from a VC and a status purpose to a status list credential.
 *
 * @param {object} options - The options to use.
 * @param {string} options.configId - The ID of the status instance config.
 * @param {string} options.credentialId - The credential ID.
 * @param {string} options.statusPurpose - The status purpose.
 * @param {string} options.statusListCredential - The status list credential ID.
 * @param {string} options.statusListIndex - The status list index.
 * @param {number} [options.sequence=0] - The sequence for updating an existing
 *   mapping.
 *
 * @returns {Promise<object>} Settles once the operation completes.
 */
export async function set({
  configId,
  credentialId, statusPurpose, statusListCredential, statusListIndex,
  sequence = 0
} = {}) {
  assert.string(configId, 'configId');
  assert.string(credentialId, 'credentialId');
  assert.string(statusPurpose, 'statusPurpose');
  assert.string(statusListCredential, 'statusListCredential');
  assert.string(statusListIndex, 'statusListIndex');
  assert.number(sequence, 'sequence');

  try {
    const collection = database.collections[COLLECTION_NAME];
    const now = Date.now();
    const $set = {
      'mapping.statusListCredential': statusListCredential,
      'mapping.statusListIndex': statusListIndex,
      'meta.updated': now,
      'meta.sequence': sequence
    };
    const result = await collection.updateOne({
      'mapping.configId': configId,
      'mapping.credentialId': credentialId,
      'mapping.statusPurpose': statusPurpose,
      'meta.sequence': sequence === 0 ? null : sequence - 1
    }, {
      $set,
      $setOnInsert: {
        'mapping.configId': configId,
        'mapping.credentialId': credentialId,
        'mapping.statusPurpose': statusPurpose,
        'meta.created': now
      }
    }, {upsert: true});

    if(result.modifiedCount > 0 || result.upsertedCount > 0) {
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
 * @param {string} options.configId - The ID of the status instance config.
 * @param {string} options.credentialId - The ID of the credential.
 * @param {string} options.statusPurpose - The status purpose.
 *
 * @returns {Promise<object>} Resolves to the stored record.
 */
export async function get({configId, credentialId, statusPurpose} = {}) {
  assert.string(configId, 'configId');
  assert.string(credentialId, 'credentialId');
  assert.string(statusPurpose, 'statusPurpose');

  const collection = database.collections[COLLECTION_NAME];
  const record = await collection.findOne({
    'mapping.configId': configId,
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
