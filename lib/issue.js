/*!
 * Copyright (c) 2022-2024 Digital Bazaar, Inc. All rights reserved.
 */
import {getZcapClient} from './helpers.js';

export async function issue({config, credential} = {}) {
  // create zcap client for issuing VCs
  const {zcapClient, zcaps} = await getZcapClient({config});

  // issue VCs in parallel
  const capability = zcaps.issue;
  // specify URL to `/credentials/issue` to handle case that capability
  // is not specific to it
  let url = capability.invocationTarget;
  if(!capability.invocationTarget.endsWith('/credentials/issue')) {
    if(!capability.invocationTarget.endsWith('/credentials')) {
      url += '/credentials/issue';
    } else {
      url += '/issue';
    }
  }
  const {
    data: {verifiableCredential}
  } = await zcapClient.write({url, capability, json: {credential}});

  return {verifiableCredential};
}
