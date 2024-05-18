/*!
 * Copyright (c) 2022-2024 Digital Bazaar, Inc. All rights reserved.
 */
import {getZcapClient} from './helpers.js';
import {parseEnvelope} from './envelopes.js';

const CREDENTIALS_CONTEXT_V1_URL = 'https://www.w3.org/2018/credentials/v1';
const CREDENTIALS_CONTEXT_V2_URL = 'https://www.w3.org/ns/credentials/v2';

export async function issue({config, credential, updateValidity = true} = {}) {
  if(updateValidity) {
    // express date without milliseconds
    const date = new Date();
    const validFrom = `${date.toISOString().slice(0, -5)}Z`;
    date.setDate(date.getDate() + 1);
    const validUntil = `${date.toISOString().slice(0, -5)}Z`;

    if(credential['@context'].includes(CREDENTIALS_CONTEXT_V1_URL)) {
      credential.issuanceDate = validFrom;
      credential.expirationDate = validUntil;
    } else {
      credential.validFrom = validFrom;
      credential.validUntil = validUntil;
    }

    // delete any existing proof
    delete credential.proof;
  }

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
  let {
    data: {verifiableCredential}
  } = await zcapClient.write({url, capability, json: {credential}});

  // parse enveloped verifiable credential as needed
  let envelope = undefined;
  if(_isEnvelopedCredential({verifiableCredential})) {
    ({envelope, verifiableCredential} = await parseEnvelope({
      envelopedVerifiableCredential: verifiableCredential
    }));
  }

  return {verifiableCredential, envelope};
}

function _isEnvelopedCredential({verifiableCredential} = {}) {
  return (verifiableCredential['@context'] === CREDENTIALS_CONTEXT_V2_URL &&
    verifiableCredential.type === 'EnvelopedCredential' &&
    verifiableCredential.id?.startsWith('data:') &&
    verifiableCredential.id.includes(','));
}
