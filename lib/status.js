/*!
 * Copyright (c) 2020-2024 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as mappings from './mappings.js';
import * as slcs from './slcs.js';
import assert from 'assert-plus';
import {decodeList} from '@digitalbazaar/vc-bitstring-status-list';
import {decodeList as decodeList2021} from '@digitalbazaar/vc-status-list';
import {issue} from './issue.js';
import {LIST_TYPE_TO_ENTRY_TYPE} from './constants.js';

const {util: {BedrockError}} = bedrock;

export async function setStatus({
  config, credentialId, indexAllocator, credentialStatus, status
} = {}) {
  assert.object(config, 'config');
  assert.string(credentialId, 'credentialId');
  assert.optionalString(indexAllocator, 'indexAllocator');
  assert.object(credentialStatus, 'credentialStatus');
  assert.bool(status, 'status');

  const {statusPurpose} = credentialStatus;
  let {statusListCredential, statusListIndex} = credentialStatus;
  const {id: configId} = config;

  // try to get an existing mapping
  let mapping;
  try {
    ({mapping} = await mappings.get({configId, credentialId, statusPurpose}));
  } catch(e) {
    if(e.name !== 'NotFoundError') {
      throw e;
    }
    // allow mapping to be not found
  }

  // if the mapping isn't found, then `statusListCredential` and
  // `statusListIndex` must be given
  if(!mapping && (statusListCredential === undefined ||
    statusListIndex === undefined)) {
    throw new BedrockError(
      `"credentialStatus.statusListCredential" and ` +
      `"credentialStatus.statusListIndex" must be provided because the ` +
      `status "${statusPurpose}" for credential "${credentialId}" has not ` +
      'been set yet.',
      'DataError', {
        httpStatusCode: 400,
        public: true
      });
  }

  if(mapping) {
    // assert mapping matches expected values
    if(statusListCredential !== undefined) {
      if(statusListCredential !== mapping.statusListCredential) {
        throw new BedrockError(
          `"credentialStatus.statusListCredential" ` +
          `(${statusListCredential}) does not match the expected value ` +
          `(${mapping.statusListCredential}).`,
          'DataError', {
            actual: statusListCredential,
            expected: mapping.statusListCredential,
            httpStatusCode: 400,
            public: true
          });
      }
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

  // compute `statusListId`
  const statusListId = _computeStatusListId({configId, statusListCredential});

  // ensure status list VC exists and matches expectation
  let record = await slcs.get({statusListId, useCache: false});
  _assertStatusListMatch({slc: record.credential, credentialStatus});

  // ensure `indexAllocator` value matches if given
  if(indexAllocator !== undefined &&
    record.indexAllocator !== indexAllocator) {
    throw new BedrockError(
      `"indexAllocator" (${indexAllocator}) ` +
      `does not match the expected value (${record.indexAllocator}).`,
      'DataError', {
        actual: indexAllocator,
        expected: record.indexAllocator,
        httpStatusCode: 400,
        public: true
      });
  }

  // create new mapping...
  if(!mapping) {
    // `indexAllocator` is required when creating a new mapping
    if(indexAllocator === undefined) {
      throw new BedrockError(
        `"indexAllocator" is required when setting the status of a ` +
        'credential the first time.',
        'DataError', {
          httpStatusCode: 400,
          public: true
        });
    }
    // add new mapping
    await mappings.set({
      configId,
      credentialId, statusPurpose, statusListCredential, statusListIndex
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
      let list;
      if(slc.type.includes('BitstringStatusListCredential')) {
        list = await decodeList({encodedList});
      } else {
        // type must be `StatusListCredential`
        list = await decodeList2021({encodedList});
      }
      if(list.getStatus(bitstringIndex) === status) {
        return;
      }

      // use index to set status
      list.setStatus(bitstringIndex, status);
      slc.credentialSubject.encodedList = await list.encode();

      // reissue SLC
      let envelope = undefined;
      ({verifiableCredential: slc, envelope} = await issue({
        config, credential: slc
      }));

      // update SLC
      await slcs.set({
        statusListId, indexAllocator: record.indexAllocator,
        credential: slc, envelope, sequence: record.meta.sequence + 1
      });
      return;
    } catch(e) {
      if(e.name !== 'InvalidStateError') {
        throw e;
      }
      // ignore conflict, read and try again
      record = await slcs.get({statusListId, useCache: false});
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

function _computeStatusListId({configId, statusListCredential}) {
  /* Note: An acceptable credential ID:

  <prefix>/status-lists/<list-specific-path>

  Which maps to:

  <configId>/status-lists/<list-specific-path>

  This implementation technically limits lists two one of these:
  <prefix>/status-lists/<localStatusListId>
  <prefix>/status-lists/<statusPurpose>/<listIndex>
  */
  const cfg = bedrock.config['vc-status'];
  const expected = `${cfg.routes.statusLists}/`;
  const idx = statusListCredential.lastIndexOf(expected);
  if(idx === -1) {
    throw new BedrockError(
      'Status list credential ID does not include expected path ' +
      `("${expected}").`,
      'DataError', {
        expected,
        httpStatusCode: 400,
        public: true
      });
  }
  return `${configId}${statusListCredential.slice(idx)}`;
}
