/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import {config, util} from '@bedrock/core';
import '@bedrock/app-identity';

const c = util.config.main;
const cc = c.computer();

const cfg = config['vc-status'] = {};

cfg.caches = {
  slc: {
    // largest SLCs should be <= ~16KiB, so 1000 is ~16MiB
    max: 1000,
    // status updates should take place within ~5 minutes
    ttl: 5 * 60 * 1000
  }
};

cfg.routes = {
  credentialsStatus: '/credentials/status',
  statusLists: '/status-lists'
};

// status list routes, supports:
// `/status-lists/<list-identifier>`
// `/status-lists/<status-purpose|namespace>/<list-identifier|listIndex>`
cc('vc-status.routes.statusList',
  () => `${config['vc-status'].routes.statusLists}/:localStatusListId`);
cc('vc-status.routes.namespacedStatusList',
  () => `${config['vc-status'].routes.statusLists}/` +
  ':localStatusListNamespace/:localStatusListId');

// create dev application identity for vc-status (must be overridden in
// deployments) ...and `ensureConfigOverride` has already been set via
// `bedrock-app-identity` so it doesn't have to be set here
config['app-identity'].seeds.services['vc-status'] = {
  id: 'did:key:z6MkpeHj5dVcBtyaWJjnB3Hck2ws5EZeuGABhhiyW92mgPxb',
  seedMultibase: 'z1Afnhw11h7ofxtZXKYvcPiDW5mDZ7cUVsjeDkNWzKeLcjE',
  serviceType: 'vc-status'
};
