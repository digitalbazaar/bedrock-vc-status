/*
 * Copyright (c) 2019-2024 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as database from '@bedrock/mongodb';
import {importJWK, SignJWT} from 'jose';
import {KeystoreAgent, KmsClient} from '@digitalbazaar/webkms-client';
import {agent} from '@bedrock/https-agent';
import {CapabilityAgent} from '@digitalbazaar/webkms-client';
import {decodeList} from '@digitalbazaar/vc-bitstring-status-list';
import {decodeList as decodeList2021} from '@digitalbazaar/vc-status-list';
import {didIo} from '@bedrock/did-io';
import {Ed25519Signature2020} from '@digitalbazaar/ed25519-signature-2020';
import {EdvClient} from '@digitalbazaar/edv-client';
import {getAppIdentity} from '@bedrock/app-identity';
import {httpClient} from '@digitalbazaar/http-client';
import {httpsAgent} from '@bedrock/https-agent';
import {parseEnvelope} from '@bedrock/vc-status/lib/envelopes.js';
import {ZcapClient} from '@digitalbazaar/ezcap';

import {mockData} from './mock.data.js';

const edvBaseUrl = `${mockData.baseUrl}/edvs`;
const kmsBaseUrl = `${mockData.baseUrl}/kms`;

const FIVE_MINUTES = 1000 * 60 * 5;

export async function createConfig({
  serviceType, url, capabilityAgent, ipAllowList, meterId, zcaps,
  configOptions = {}, oauth2 = false
} = {}) {
  if(!meterId) {
    // create a meter
    ({id: meterId} = await createMeter({capabilityAgent, serviceType}));
  }

  // create service object
  const config = {
    sequence: 0,
    controller: capabilityAgent.id,
    meterId,
    ...configOptions
  };
  if(ipAllowList) {
    config.ipAllowList = ipAllowList;
  }
  if(zcaps) {
    config.zcaps = zcaps;
  }
  if(oauth2) {
    const {baseUri} = bedrock.config.server;
    config.authorization = {
      oauth2: {
        issuerConfigUrl: `${baseUri}${mockData.oauth2IssuerConfigRoute}`
      }
    };
  }

  const zcapClient = createZcapClient({capabilityAgent});
  const response = await zcapClient.write({url, json: config});
  return response.data;
}

export async function createStatusConfig({
  capabilityAgent, ipAllowList, meterId, zcaps, oauth2 = false
} = {}) {
  const url = `${mockData.baseUrl}/statuses`;
  return createConfig({
    serviceType: 'vc-status',
    url, capabilityAgent, ipAllowList, meterId, zcaps, oauth2
  });
}

export async function createIssuerConfig({
  capabilityAgent, ipAllowList, meterId, zcaps,
  statusListOptions, oauth2 = false
} = {}) {
  const url = `${mockData.baseUrl}/issuers`;
  // issuer-specific options
  const configOptions = {
    issueOptions: {
      suiteName: 'eddsa-rdfc-2022'
    },
    statusListOptions
  };
  return createConfig({
    serviceType: 'vc-issuer',
    url, capabilityAgent, ipAllowList, meterId, zcaps, configOptions, oauth2
  });
}

export async function createMeter({capabilityAgent, serviceType} = {}) {
  // create signer using the application's capability invocation key
  const {keys: {capabilityInvocationKey}} = getAppIdentity();

  const zcapClient = new ZcapClient({
    agent: httpsAgent,
    invocationSigner: capabilityInvocationKey.signer(),
    SuiteClass: Ed25519Signature2020
  });

  // create a meter
  const meterService = `${bedrock.config.server.baseUri}/meters`;
  let meter = {
    controller: capabilityAgent.id,
    product: {
      // mock ID for service type
      id: mockData.productIdMap.get(serviceType)
    }
  };
  ({data: {meter}} = await zcapClient.write({url: meterService, json: meter}));

  // return full meter ID
  const {id} = meter;
  return {id: `${meterService}/${id}`};
}

export async function getConfig({id, capabilityAgent, accessToken}) {
  if(accessToken) {
    // do OAuth2
    const {data} = await httpClient.get(id, {
      agent: httpsAgent,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    return data;
  }
  if(!capabilityAgent) {
    throw new Error('Either "capabilityAgent" or "accessToken" is required.');
  }
  // do zcap
  const zcapClient = createZcapClient({capabilityAgent});
  const {data} = await zcapClient.read({url: id});
  return data;
}

export async function getOAuth2AccessToken({
  configId, action, target, exp, iss, nbf, typ = 'at+jwt'
}) {
  const scope = `${action}:${target}`;
  const builder = new SignJWT({scope})
    .setProtectedHeader({alg: 'EdDSA', typ})
    .setIssuer(iss ?? mockData.oauth2Config.issuer)
    .setAudience(configId);
  if(exp !== undefined) {
    builder.setExpirationTime(exp);
  } else {
    // default to 5 minute expiration time
    builder.setExpirationTime('5m');
  }
  if(nbf !== undefined) {
    builder.setNotBefore(nbf);
  }
  const key = await importJWK({...mockData.ed25519KeyPair, alg: 'EdDSA'});
  return builder.sign(key);
}

export async function createEdv({
  capabilityAgent, keystoreAgent, keyAgreementKey, hmac, meterId
}) {
  if(!meterId) {
    // create a meter for the keystore
    ({id: meterId} = await createMeter({
      capabilityAgent, serviceType: 'edv'
    }));
  }

  if(!(keyAgreementKey && hmac) && keystoreAgent) {
    // create KAK and HMAC keys for edv config
    ([keyAgreementKey, hmac] = await Promise.all([
      keystoreAgent.generateKey({type: 'keyAgreement'}),
      keystoreAgent.generateKey({type: 'hmac'})
    ]));
  }

  // create edv
  const newEdvConfig = {
    sequence: 0,
    controller: capabilityAgent.id,
    keyAgreementKey: {id: keyAgreementKey.id, type: keyAgreementKey.type},
    hmac: {id: hmac.id, type: hmac.type},
    meterId
  };

  const edvConfig = await EdvClient.createEdv({
    config: newEdvConfig,
    httpsAgent,
    invocationSigner: capabilityAgent.getSigner(),
    url: edvBaseUrl
  });

  const edvClient = new EdvClient({
    id: edvConfig.id,
    keyResolver,
    keyAgreementKey,
    hmac,
    httpsAgent
  });

  return {edvClient, edvConfig, hmac, keyAgreementKey};
}

export async function createKeystore({
  capabilityAgent, ipAllowList, meterId,
  kmsModule = 'ssm-v1'
}) {
  if(!meterId) {
    // create a meter for the keystore
    ({id: meterId} = await createMeter(
      {capabilityAgent, serviceType: 'webkms'}));
  }

  // create keystore
  const config = {
    sequence: 0,
    controller: capabilityAgent.id,
    meterId,
    kmsModule
  };
  if(ipAllowList) {
    config.ipAllowList = ipAllowList;
  }

  return KmsClient.createKeystore({
    url: `${kmsBaseUrl}/keystores`,
    config,
    invocationSigner: capabilityAgent.getSigner(),
    httpsAgent
  });
}

export async function createKeystoreAgent({capabilityAgent, ipAllowList}) {
  let err;
  let keystore;
  try {
    keystore = await createKeystore({capabilityAgent, ipAllowList});
  } catch(e) {
    err = e;
  }
  assertNoError(err);

  // create kmsClient only required because we need to use httpsAgent
  // that accepts self-signed certs used in test suite
  const kmsClient = new KmsClient({httpsAgent});
  const keystoreAgent = new KeystoreAgent({
    capabilityAgent,
    keystoreId: keystore.id,
    kmsClient
  });

  return keystoreAgent;
}

export async function createStatusList({
  url, capabilityAgent, capability, statusListOptions
}) {
  const zcapClient = createZcapClient({capabilityAgent});
  const response = await zcapClient.write({
    url, json: statusListOptions, capability
  });
  const statusListId = response.headers.get('location');
  return {id: statusListId};
}

export function createZcapClient({
  capabilityAgent, delegationSigner, invocationSigner
}) {
  const signer = capabilityAgent && capabilityAgent.getSigner();
  return new ZcapClient({
    agent: httpsAgent,
    invocationSigner: invocationSigner || signer,
    delegationSigner: delegationSigner || signer,
    SuiteClass: Ed25519Signature2020
  });
}

export async function delegate({
  capability, controller, invocationTarget, expires, allowedActions,
  delegator
}) {
  const zcapClient = createZcapClient({capabilityAgent: delegator});
  expires = expires || (capability && capability.expires) ||
    new Date(Date.now() + FIVE_MINUTES).toISOString().slice(0, -5) + 'Z';
  return zcapClient.delegate({
    capability, controller, expires, invocationTarget, allowedActions
  });
}

export async function getCredentialStatus({
  statusListCredential, statusListIndex
}) {
  let {data: slc} = await httpClient.get(
    statusListCredential, {agent: httpsAgent});

  // parse enveloped VC as needed
  if(slc.type === 'EnvelopedVerifiableCredential') {
    ({verifiableCredential: slc} = await parseEnvelope({
      envelopedVerifiableCredential: slc
    }));
  }

  const {encodedList} = slc.credentialSubject;
  let list;
  if(slc.type.includes('BitstringStatusListCredential')) {
    list = await decodeList({encodedList});
  } else {
    // type must be `StatusListCredential`
    list = await decodeList2021({encodedList});
  }
  const status = list.getStatus(parseInt(statusListIndex, 10));
  return {status, statusListCredential, statusListIndex};
}

export async function getStatusListCredential({statusListId}) {
  let {data: slc} = await httpClient.get(statusListId, {agent: httpsAgent});
  // parse enveloped VC as needed
  if(slc.type === 'EnvelopedVerifiableCredential') {
    ({verifiableCredential: slc} = await parseEnvelope({
      envelopedVerifiableCredential: slc
    }));
  }
  return slc;
}

export async function provisionDependencies() {
  const secret = '53ad64ce-8e1d-11ec-bb12-10bf48838a41';
  const handle = 'test';
  const capabilityAgent = await CapabilityAgent.fromSecret({secret, handle});

  // create keystore for capability agent
  const keystoreAgent = await createKeystoreAgent({capabilityAgent});

  const [
    {
      issuerConfig,
      statusIssueZcap
    }
  ] = await Promise.all([
    provisionIssuer({capabilityAgent, keystoreAgent})
  ]);

  return {
    capabilityAgent,
    issuerConfig,
    statusIssueZcap
  };
}

export async function provisionIssuer({capabilityAgent, keystoreAgent}) {
  // generate key for signing VCs (make it a did:key DID for simplicity)
  const assertionMethodKey = await keystoreAgent.generateKey({
    type: 'asymmetric',
    publicAliasTemplate: 'did:key:{publicKeyMultibase}#{publicKeyMultibase}'
  });

  // create EDV for storage (creating hmac and kak in the process)
  const {
    edvConfig,
    hmac,
    keyAgreementKey
  } = await createEdv({capabilityAgent, keystoreAgent});

  // get service agent to delegate to
  const issuerServiceAgentUrl =
    `${mockData.baseUrl}/service-agents/${encodeURIComponent('vc-issuer')}`;
  const {data: issuerServiceAgent} = await httpClient.get(
    issuerServiceAgentUrl, {agent});

  // delegate edv, hmac, and key agreement key zcaps to service agent
  const {id: edvId} = edvConfig;
  const zcaps = {};
  zcaps.edv = await delegate({
    controller: issuerServiceAgent.id,
    delegator: capabilityAgent,
    invocationTarget: edvId
  });
  const {keystoreId} = keystoreAgent;
  zcaps.hmac = await delegate({
    capability: `urn:zcap:root:${encodeURIComponent(keystoreId)}`,
    controller: issuerServiceAgent.id,
    invocationTarget: hmac.id,
    delegator: capabilityAgent
  });
  zcaps.keyAgreementKey = await delegate({
    capability: `urn:zcap:root:${encodeURIComponent(keystoreId)}`,
    controller: issuerServiceAgent.id,
    invocationTarget: keyAgreementKey.kmsId,
    delegator: capabilityAgent
  });
  zcaps.assertionMethod = await delegate({
    capability: `urn:zcap:root:${encodeURIComponent(keystoreId)}`,
    controller: issuerServiceAgent.id,
    invocationTarget: assertionMethodKey.kmsId,
    delegator: capabilityAgent
  });

  // create issuer instance w/ oauth2-based authz
  const issuerConfig = await createIssuerConfig(
    {capabilityAgent, zcaps, oauth2: true});
  const {id: issuerId} = issuerConfig;
  const issuerRootZcap = `urn:zcap:root:${encodeURIComponent(issuerId)}`;

  // insert examples context
  const examplesContextId = 'https://www.w3.org/2018/credentials/examples/v1';
  const {examplesContext} = mockData;
  const client = createZcapClient({capabilityAgent});
  const url = `${issuerId}/contexts`;
  await client.write({
    url, json: {id: examplesContextId, context: examplesContext},
    capability: issuerRootZcap
  });

  // insert prc context
  const prcContextId = 'https://w3id.org/citizenship/v1';
  const {prcCredentialContext} = mockData;
  await client.write({
    url, json: {id: prcContextId, context: prcCredentialContext},
    capability: issuerRootZcap
  });

  // delegate issuer root zcap to status service
  const statusServiceAgentUrl =
    `${mockData.baseUrl}/service-agents/${encodeURIComponent('vc-status')}`;
  const {data: statusServiceAgent} = await httpClient.get(
    statusServiceAgentUrl, {agent});

  // zcap to issue a credential
  const statusIssueZcap = await delegate({
    capability: issuerRootZcap,
    controller: statusServiceAgent.id,
    invocationTarget: `${issuerId}/credentials/issue`,
    delegator: capabilityAgent
  });

  return {issuerConfig, statusIssueZcap};
}

export async function revokeDelegatedCapability({
  serviceObjectId, capabilityToRevoke, invocationSigner
}) {
  const url = `${serviceObjectId}/zcaps/revocations/` +
    encodeURIComponent(capabilityToRevoke.id);
  const zcapClient = createZcapClient({invocationSigner});
  return zcapClient.write({url, json: capabilityToRevoke});
}

async function keyResolver({id}) {
  // support DID-based keys only
  if(id.startsWith('did:')) {
    return didIo.get({url: id});
  }
  // support HTTP-based keys; currently a requirement for WebKMS
  const {data} = await httpClient.get(id, {agent: httpsAgent});
  return data;
}

const serviceCoreConfigCollection =
  database.collections['service-core-config-vc-status'];

export async function updateConfig({configId, referenceId}) {
  const updateReferenceId = {
    'config.zcaps.assertionMethod': `config.zcaps.${referenceId}`
  };
  await serviceCoreConfigCollection.updateOne({
    'config.id': configId,
  }, {
    $rename: updateReferenceId
  });
}

export async function findConfig({configId}) {
  return serviceCoreConfigCollection.findOne({
    'config.id': configId,
  });
}
