/*!
 * Copyright (c) 2018-2024 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import * as slcs from './slcs.js';
import {
  compile, createValidateMiddleware as validate
} from '@bedrock/validation';
import {
  createStatusListBody,
  updateCredentialStatusBody
} from '../schemas/bedrock-vc-status.js';
import {metering, middleware} from '@bedrock/service-core';
import {asyncHandler} from '@bedrock/express';
import cors from 'cors';
import {logger} from './logger.js';
import {setStatus} from './status.js';

const {util: {BedrockError}} = bedrock;

export async function addRoutes({app, service} = {}) {
  const {routePrefix} = service;

  const cfg = bedrock.config['vc-status'];
  const baseUrl = `${routePrefix}/:localId`;
  const routes = {
    credentialsStatus: `${baseUrl}${cfg.routes.credentialsStatus}`,
    // status list routes
    statusLists: `${baseUrl}${cfg.routes.statusLists}`,
    statusList: `${baseUrl}${cfg.routes.statusList}`,
    namespacedStatusList: `${baseUrl}${cfg.routes.namespacedStatusList}`
  };

  const getConfigMiddleware = middleware.createGetConfigMiddleware({service});

  // pre-compile schemas
  const createStatusListBodySchema = compile({schema: createStatusListBody});

  /* Note: CORS is used on all endpoints. This is safe because authorization
  uses HTTP signatures + capabilities or OAuth2, not cookies; CSRF is not
  possible. */

  // create a status list / force refresh of an existing one
  app.options(routes.statusList, cors());
  app.post(
    routes.statusList,
    cors(),
    getConfigMiddleware,
    middleware.authorizeServiceObjectRequest(),
    asyncHandler(async (req, res) => {
      await _createOrRefreshStatusList({req, res, createStatusListBodySchema});
    }));

  // get latest credential for status list, no-authz required
  app.get(
    routes.statusList,
    cors(),
    getConfigMiddleware,
    asyncHandler(async (req, res) => {
      const {config} = req.serviceObject;
      const statusListId = _getStatusListId({req});
      const {credential} = await slcs.getFresh({config, statusListId});
      res.json(credential);
    }));

  // create a namespaced status list / force refresh of an existing one
  app.options(routes.namespacedStatusList, cors());
  app.post(
    routes.namespacedStatusList,
    cors(),
    getConfigMiddleware,
    middleware.authorizeServiceObjectRequest(),
    asyncHandler(async (req, res) => {
      await _createOrRefreshStatusList({req, res, createStatusListBodySchema});
    }));

  // get latest credential for namespaced status list, no-authz required
  app.get(
    routes.namespacedStatusList,
    cors(),
    getConfigMiddleware,
    asyncHandler(async (req, res) => {
      const {config} = req.serviceObject;
      const statusListId = _getStatusListId({req});
      const {credential} = await slcs.getFresh({config, statusListId});
      res.json(credential);
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
        const {
          credentialId, indexAllocator, credentialStatus, status = true
        } = req.body;
        await setStatus({
          config, credentialId, indexAllocator, credentialStatus, status
        });
        res.status(200).end();
      } catch(error) {
        logger.error(error.message, {error});
        throw error;
      }

      // meter operation usage
      metering.reportOperationUsage({req});
    }));
}

async function _createOrRefreshStatusList({
  req, res, createStatusListBodySchema
}) {
  // perform validation on body based on `refresh` query param
  const refresh = (req.query.refresh === 'true');
  if(refresh) {
    if(!(req.body && Object.keys(req.body).length === 0)) {
      throw new BedrockError(
        'POST body must be empty to refresh an existing status list.', {
          name: 'DataError',
          details: {
            httpStatusCode: 400,
            public: true
          }
        });
    }
  } else {
    const result = createStatusListBodySchema(req.body);
    if(!result.valid) {
      throw result.error;
    }
  }

  // FIXME: check available storage via meter before allowing operation
  try {
    const {config} = req.serviceObject;
    const statusListId = _getStatusListId({req});

    if(refresh) {
      // force refresh
      await slcs.refresh({config, statusListId});
      res.sendStatus(204);
    } else {
      const {
        credentialId, indexAllocator, type, length, statusPurpose
      } = req.body;
      await slcs.create({
        config, statusListId, credentialId, indexAllocator,
        type, statusPurpose, length
      });
      res.status(204).location(statusListId).send();
    }
  } catch(error) {
    logger.error(error.message, {error});
    throw error;
  }

  // meter operation usage
  metering.reportOperationUsage({req});
}

function _getStatusListId({req}) {
  const cfg = bedrock.config['vc-status'];
  const {config} = req.serviceObject;
  const {localStatusListNamespace, localStatusListId} = req.params;
  let statusListId = `${config.id}${cfg.routes.statusLists}/`;
  if(localStatusListNamespace !== undefined) {
    statusListId += `${encodeURIComponent(localStatusListNamespace)}/`;
  }
  statusListId += encodeURIComponent(localStatusListId);
  return statusListId;
}
