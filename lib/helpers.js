/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
 */
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import etag from 'etag';
import {generateId} from 'bnid';
import {httpsAgent} from '@bedrock/https-agent';
import {serviceAgents} from '@bedrock/service-agent';
import {SKEW_TIME_MS} from './constants.js';
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

export function sendCacheableJson({
  res, obj, validUntil
} = {}) {
  let maxAge = 0;
  if(validUntil) {
    const now = new Date();
    now.setTime(now.getTime() + SKEW_TIME_MS);
    const validUntilTime = validUntil.getTime();
    if(validUntilTime > now) {
      maxAge = Math.floor((validUntilTime - now) / 1000);
    }
  }
  // compute e-tag to enable caching
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.header('content-type', 'application/json');
  // "public": can be cached by CloudFront and other CDNs
  // "max-age": how long browsers should cache (in seconds)
  // "s-maxage": how long shared caches should cache (in seconds)
  res.header('cache-control', `public, max-age=${maxAge}, s-maxage=${maxAge}`);
  res.header('etag', etag(body));
  res.removeHeader('expires');
  res.removeHeader('pragma');
  res.send(body);
}
