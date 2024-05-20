/*!
 * Copyright (c) 2020-2024 Digital Bazaar, Inc. All rights reserved.
 */
import * as base64url from 'base64url-universal';
import * as bedrock from '@bedrock/core';

const {util: {BedrockError}} = bedrock;

const TEXT_DECODER = new TextDecoder();

export async function parseEnvelope({
  envelopedVerifiableCredential
} = {}) {
  const {id: dataURL} = envelopedVerifiableCredential;

  // parse media type and encoding from data URL
  const commaIndex = dataURL.indexOf(',');
  let mediaType = dataURL.slice('data:'.length, commaIndex);
  const semicolonIndex = mediaType.indexOf(';');
  const encoding = semicolonIndex !== -1 ?
    mediaType.slice(semicolonIndex) : undefined;
  if(encoding !== undefined) {
    mediaType = mediaType.slice(0, -encoding.length);
  }

  // parse data
  const data = dataURL.slice(commaIndex + 1);

  try {
    // VC-JWT
    if(mediaType === 'application/jwt' && encoding === undefined) {
      // parse JWT
      const split = data.split('.');
      const payload = JSON.parse(
        TEXT_DECODER.decode(base64url.decode(split[1])));
      const envelope = {data, mediaType};
      return {envelope, verifiableCredential: payload};
    }
  } catch(e) {
    throw new BedrockError(
      `Error when parsing enveloped verifiable credential of "${mediaType}".`, {
        name: 'DataError',
        details: {
          httpStatusCode: 500,
          public: true
        },
        cause: new BedrockError(e.message, {
          name: 'DataError',
          details: {
            httpStatusCode: 500,
            public: true
          }
        })
      });
  }

  // unrecognized media type and encoding combination
  const andEncoding = encoding ? `and encoding ${encoding} ` : '';
  throw new BedrockError(
    `Enveloped credential media type "${mediaType}" ` +
    `${andEncoding}is not supported.`, {
      name: 'NotSupportedError',
      details: {
        httpStatusCode: 500,
        public: true
      }
    });
}
