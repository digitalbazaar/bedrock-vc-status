/*!
 * Copyright (c) 2024 Digital Bazaar, Inc. All rights reserved.
 */
// matching status list type => status entry type
export const LIST_TYPE_TO_ENTRY_TYPE = new Map([
  ['BitstringStatusList', 'BitstringStatusListEntry'],
  // FIXME: remove support for deprecated status list types
  ['StatusList2021', 'StatusList2021Entry']
]);

export const MAX_LIST_SIZE = 131072;

export const serviceType = 'vc-status';
