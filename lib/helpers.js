/*!
 * Copyright (c) 2020-2024 Digital Bazaar, Inc. All rights reserved.
 */
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {generateId} from 'bnid';
import {httpsAgent} from '@bedrock/https-agent';
import {serviceAgents} from '@bedrock/service-agent';
import {ZcapClient} from '@digitalbazaar/ezcap';

export async function generateLocalId() {
  // 128-bit random number, base58 multibase + multihash encoded
  return generateId({
    bitLength: 128,
    encoding: 'base58',
    multibase: true,
    multihash: true
  });
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
