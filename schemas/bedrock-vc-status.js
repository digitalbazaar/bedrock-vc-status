/*!
 * Copyright (c) 2022-2024 Digital Bazaar, Inc. All rights reserved.
 */
import {MAX_LIST_SIZE} from '../lib/constants.js';

// an ID value required to unambiguously identify index allocation state
const indexAllocator = {
  // an ID (URL) referring to an index allocator
  type: 'string',
  pattern: '^(.+):(.+)$'
};

export const createStatusListBody = {
  title: 'Create Status List',
  type: 'object',
  additionalProperties: false,
  required: [
    'credentialId', 'indexAllocator', 'type', 'length', 'statusPurpose'
  ],
  properties: {
    credentialId: {
      type: 'string'
    },
    indexAllocator,
    type: {
      type: 'string',
      // supported types in this version
      enum: [
        'BitstringStatusList',
        // FIXME: consider removing `StatusList2021` support
        'StatusList2021'
      ]
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
  required: ['credentialId', 'credentialStatus'],
  additionalProperties: false,
  properties: {
    credentialId: {
      type: 'string'
    },
    indexAllocator,
    credentialStatus: {
      type: 'object',
      required: ['type', 'statusPurpose'],
      additionalProperties: false,
      properties: {
        id: {
          type: 'string'
        },
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
    },
    status: {
      type: 'boolean'
    }
  }
};
