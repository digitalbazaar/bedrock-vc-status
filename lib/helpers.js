/*!
 * Copyright (c) 2020-2024 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {documentStores} from '@bedrock/service-agent';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {generateId} from 'bnid';
import {httpsAgent} from '@bedrock/https-agent';
import {serviceAgents} from '@bedrock/service-agent';
import {serviceType} from './constants.js';
import {ZcapClient} from '@digitalbazaar/ezcap';

const {util: {BedrockError}} = bedrock;

export function assertSlcDoc({slcDoc, id} = {}) {
  if(!(slcDoc?.meta.type === 'VerifiableCredential' &&
    _isStatusListCredential({credential: slcDoc?.content}))) {
    throw new BedrockError(
      `Credential "${id}" is not a supported status list credential.`, {
        name: 'DataError',
        details: {
          httpStatusCode: 400,
          public: true
        }
      });
  }
}

export async function generateLocalId() {
  // 128-bit random number, base58 multibase + multihash encoded
  return generateId({
    bitLength: 128,
    encoding: 'base58',
    multibase: true,
    multihash: true
  });
}

// FIXME: remove, only use mongodb
export async function getDocumentStore({config}) {
  // ensure indexes are set for VCs
  const {documentStore} = await documentStores.get({config, serviceType});
  const {edvClient} = documentStore;
  // use `meta.credentialStatus.id` field as some credentials may not include
  // the ID directly
  edvClient.ensureIndex({
    attribute: ['meta.credentialStatus.id'],
    unique: true
  });
  return documentStore;
}

export async function getZcapClient({config} = {}) {
  // get service agent for communicating with the issuer instance
  const {serviceAgent} = await serviceAgents.get(
    {serviceType: 'vc-status'});
  const {capabilityAgent, zcaps} = await serviceAgents.getEphemeralAgent(
    {config, serviceAgent});

  // create zcap client for issuing VCs
  const zcapClient = new ZcapClient({
    agent: httpsAgent,
    invocationSigner: capabilityAgent.getSigner(),
    SuiteClass: Ed25519Signature2020
  });

  return {zcapClient, zcaps};
}

// check if `credential` is some known type of status list credential
function _isStatusListCredential({credential}) {
  // FIXME: check for VC context as well
  if(!(credential['@context'] && Array.isArray(credential['@context']))) {
    return false;
  }
  if(!(credential.type && Array.isArray(credential.type) &&
    credential.type.includes('VerifiableCredential'))) {
    return false;
  }

  for(const type of credential.type) {
    if(type === 'RevocationList2020Credential') {
      // FIXME: check for matching `@context` as well
      return true;
    }
    if(type === 'StatusList2021Credential') {
      // FIXME: check for matching `@context as well
      return true;
    }
  }
  // FIXME: check other types

  return false;
}
