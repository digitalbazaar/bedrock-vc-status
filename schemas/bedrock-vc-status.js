/*!
 * Copyright (c) 2022-2024 Digital Bazaar, Inc. All rights reserved.
 */
import {
  DEFAULT_BLOCK_COUNT, DEFAULT_BLOCK_SIZE, MAX_LIST_COUNT
} from '../lib/constants.js';

export const createStatusListBody = {
  title: 'Create Status List',
  type: 'object',
  additionalProperties: false,
  properties: {
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
      type: 'string'
    },
    length: {
      type: 'number'
    }
  }
};

// FIXME: use with `createStatusListBody` as needed
export const statusListConfig = {
  title: 'Status List Configuration',
  type: 'object',
  required: ['type', 'suiteName', 'statusPurpose'],
  additionalProperties: false,
  properties: {
    type: {
      type: 'string',
      // supported types in this version
      enum: [
        'BitstringStatusList',
        // FIXME: consider removing `StatusList2021` support
        'StatusList2021'
      ]
    },
    // FIXME: make `baseUrl` required once status service is separated
    // base URL to use for new lists
    baseUrl: {
      type: 'string'
    },
    // an ID value required to track index allocation and used with external
    // status list service; can be auto-generated, so not required
    indexAllocator: {
      // an ID (URL) referring to an index allocator
      type: 'string'
    },
    suiteName: {
      type: 'string',
      // supported suites in this version
      enum: [
        'ecdsa-rdfc-2019', 'eddsa-rdfc-2022', 'Ed25519Signature2020',
        'Ed25519Signature2018', 'ecdsa-sd-2023'
      ]
    },
    // note: scoped to `type`
    statusPurpose: {
      // FIXME: also support array with multiple status purposes; triggers
      // creation of multiple lists
      type: 'string',
      // supported status types in this version
      enum: ['revocation', 'suspension']
    },
    // note: scoped to `type`; will be auto-populated with defaults so not
    // required
    options: {
      type: 'object',
      additionalProperties: false,
      properties: {
        blockCount: {
          type: 'integer',
          minimum: 1,
          maximum: DEFAULT_BLOCK_COUNT
        },
        blockSize: {
          type: 'integer',
          minimum: 1,
          maximum: DEFAULT_BLOCK_SIZE
        },
        // note: some list types will require a `listCount`, each having their
        // own different list count limits and defaults applied elsewhere; the
        // `MAX_LIST_COUNT` here is the maximum this software can keep track of
        listCount: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIST_COUNT
        }
      }
    }
  }
};

export const statusListOptions = {
  title: 'Status List Options',
  type: 'array',
  minItems: 1,
  items: statusListConfig
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
