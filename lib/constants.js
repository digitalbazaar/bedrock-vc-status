/*!
 * Copyright (c) 2024-2025 Digital Bazaar, Inc. All rights reserved.
 */
// matching status list type => status entry type
export const LIST_TYPE_TO_ENTRY_TYPE = new Map([
  ['BitstringStatusList', 'BitstringStatusListEntry'],
  // FIXME: remove support for deprecated status list types
  ['StatusList2021', 'StatusList2021Entry']
]);

// max list size is 2^26, which is the largest size a totally random,
// unencrypted list can be (8MiB) without breaking the max 10MiB storage
// barrier for a single VC -- leaving 2MiB of space for other information
// beyond the list in a status list credential
// 2^26/2^3/2^10/2^10=2^3 = 8
// 67108864 bits / 8 / 1024 / 1024 = 8MiB
export const MAX_LIST_SIZE = 67108864;

export const SKEW_TIME_MS = 5 * 60 * 1000; // 5 minutes

export const serviceType = 'vc-status';
