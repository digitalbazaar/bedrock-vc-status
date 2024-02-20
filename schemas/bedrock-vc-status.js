/*!
 * Copyright (c) 2022-2024 Digital Bazaar, Inc. All rights reserved.
 */
import {MAX_LIST_SIZE} from '../lib/constants.js';

export const createStatusListBody = {
  title: 'Create Status List',
  type: 'object',
  required: ['id', 'type', 'indexAllocator', 'length', 'statusPurpose'],
  additionalProperties: false,
  properties: {
    // FIXME: needs to support both:
    // /<listId>
    // /statusPurpose/<listIndex>
    id: {
      type: 'string'
    },
    type: {
      type: 'string',
      // supported types in this version
      enum: [
        'BitstringStatusList',
        // FIXME: consider removing `StatusList2021` support
        'StatusList2021'
      ]
    },
    // an ID value required to track index allocation
    indexAllocator: {
      // an ID (URL) referring to an index allocator
      type: 'string',
      // FIXME: pull in schema from bedrock-validation that uses
      // `uri` pattern from ajv-formats once available
      pattern: '^(.+):(.+)$'
    },
    // length of the status list in bits
    length: {
      type: 'number',
      min: 8,
      max: MAX_LIST_SIZE
    },
    statusPurpose: {
      type: 'string'
    }
  }
};

export const updateCredentialStatusBody = {
  title: 'Update Credential Status',
  type: 'object',
  // FIXME: consider if `indexAllocator` should be required
  required: ['credentialId', 'credentialStatus'],
  additionalProperties: false,
  properties: {
    credentialId: {
      type: 'string'
    },
    credentialStatus: {
      type: 'object',
      required: ['type', 'statusPurpose'],
      additionalProperties: false,
      properties: {
        type: {
          type: 'string'
        },
        statusListCredential: {
          type: 'string'
        },
        statusListIndex: {
          type: 'string'
        },
        statusPurpose: {
          type: 'string'
        }
      }
    }
  }
};

export const publishSlcBody = {
  title: 'Publish Status List Credential',
  type: 'object',
  additionalProperties: false,
  // body must be empty
  properties: {}
};
