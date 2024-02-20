/*!
 * Copyright (c) 2018-2024 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as slcs from './slcs.js';
import {
  createStatusListBody,
  publishSlcBody,
  updateCredentialStatusBody
} from '../schemas/bedrock-vc-status.js';
import {metering, middleware} from '@bedrock/service-core';
import {asyncHandler} from '@bedrock/express';
import bodyParser from 'body-parser';
import cors from 'cors';
import {logger} from './logger.js';
import {createValidateMiddleware as validate} from '@bedrock/validation';

// FIXME: remove and apply at top-level application
bedrock.events.on('bedrock-express.configure.bodyParser', app => {
  app.use(bodyParser.json({
    // allow json values that are not just objects or arrays
    strict: false,
    limit: '10MB',
    type: ['json', '+json']
  }));
});

export async function addRoutes({app, service} = {}) {
  const {routePrefix} = service;

  const cfg = bedrock.config['vc-status'];
  const baseUrl = `${routePrefix}/:localId`;
  const routes = {
    credentialsStatus: `${baseUrl}${cfg.routes.credentialsStatus}`,
    publishSlc: `${baseUrl}${cfg.routes.publishSlc}`,
    publishTerseSlc: `${baseUrl}${cfg.routes.publishTerseSlc}`,
    slcs: `${baseUrl}${cfg.routes.slcs}`,
    slc: `${baseUrl}${cfg.routes.slc}`,
    terseSlc: `${baseUrl}${cfg.routes.terseSlc}`
  };

  const getConfigMiddleware = middleware.createGetConfigMiddleware({service});

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities or OAuth2, not cookies; CSRF is not
  possible. */

  // FIXME: add API for creating status lists off of a particular config
  // that will issue using a particular zcap/issuer
  // create an exchange
  // FIXME: determine if `/slcs` should be used or `/status-lists
  app.options(routes.slcs, cors());
  app.post(
    routes.slcs,
    cors(),
    validate({bodySchema: createStatusListBody}),
    getConfigMiddleware,
    middleware.authorizeServiceObjectRequest(),
    asyncHandler(async (req, res) => {
      // FIXME: check available storage via meter before allowing operation

      try {
        const {config} = req.serviceObject;
        //const {type, indexAllocator} = req.body;
        // FIXME: use given list ID params
        // FIXME: call slcs.create({...});

        const location = `${config.id}/slcs`;
        res.status(204).location(location).send();
      } catch(error) {
        logger.error(error.message, {error});
        throw error;
      }

      // meter operation usage
      metering.reportOperationUsage({req});
    }));

  // update credential status
  app.options(routes.credentialsStatus, cors());
  app.post(
    routes.credentialsStatus,
    cors(),
    validate({bodySchema: updateCredentialStatusBody}),
    getConfigMiddleware,
    middleware.authorizeServiceObjectRequest(),
    asyncHandler(async (req, res) => {
      try {
        const {config} = req.serviceObject;
        // FIXME: require `indexAllocator` if not previously set
        const {credentialId, credentialStatus} = req.body;

        // FIXME: support client requesting `status=false` as well
        await slcs.setStatus({
          id: credentialId, config, credentialStatus, status: true
        });

        res.status(200).end();
      } catch(error) {
        logger.error(error.message, {error});
        throw error;
      }

      // meter operation usage
      metering.reportOperationUsage({req});
    }));

  // publish the latest non-terse SLC from EDV storage
  app.options(routes.publishSlc, cors());
  app.post(
    routes.publishSlc,
    cors(),
    validate({bodySchema: publishSlcBody}),
    getConfigMiddleware,
    middleware.authorizeServiceObjectRequest(),
    asyncHandler(async (req, res) => {
      const {config} = req.serviceObject;
      const {slcId} = req.params;
      const id = `${config.id}${cfg.routes.slcs}/${encodeURIComponent(slcId)}`;

      await slcs.refresh({id, config});
      res.sendStatus(204);

      // meter operation usage
      metering.reportOperationUsage({req});
    }));

  // get latest published non-terse SLC, no-authz required
  app.get(
    routes.slc,
    cors(),
    getConfigMiddleware,
    asyncHandler(async (req, res) => {
      const {config} = req.serviceObject;
      const {slcId} = req.params;
      const id = `${config.id}${cfg.routes.slcs}/${encodeURIComponent(slcId)}`;
      const {credential} = await slcs.getFresh({id, config});
      res.json(credential);
    }));

  // publish the latest terse SLC from EDV storage
  app.options(routes.publishTerseSlc, cors());
  app.post(
    routes.publishTerseSlc,
    cors(),
    validate({bodySchema: publishSlcBody}),
    getConfigMiddleware,
    middleware.authorizeServiceObjectRequest(),
    asyncHandler(async (req, res) => {
      const {config} = req.serviceObject;
      const {statusPurpose, listIndex} = req.params;
      const id = `${config.id}${cfg.routes.terseSlcs}/` +
        `${encodeURIComponent(statusPurpose)}/${listIndex}`;

      await slcs.refresh({id, config});
      res.sendStatus(204);

      // meter operation usage
      metering.reportOperationUsage({req});
    }));

  // get latest published terse SLC, no-authz required
  app.get(
    routes.terseSlc,
    cors(),
    getConfigMiddleware,
    asyncHandler(async (req, res) => {
      const {config} = req.serviceObject;
      const {statusPurpose, listIndex} = req.params;
      const id = `${config.id}${cfg.routes.terseSlcs}/` +
        `${encodeURIComponent(statusPurpose)}/${listIndex}`;
      const {credential} = await slcs.getFresh({id, config});
      res.json(credential);
    }));
}
