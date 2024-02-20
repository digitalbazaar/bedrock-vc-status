/*!
 * Copyright (c) 2021-2024 Digital Bazaar, Inc. All rights reserved.
 */
import * as bedrock from '@bedrock/core';
import {addRoutes} from './http.js';
import {createService} from '@bedrock/service-core';
import {initializeServiceAgent} from '@bedrock/service-agent';
import {serviceType} from './constants.js';

// load config defaults
import './config.js';

bedrock.events.on('bedrock.init', async () => {
  // create `vc-status` service
  const service = await createService({
    serviceType,
    routePrefix: '/vc-status',
    storageCost: {
      config: 1,
      revocation: 1
    },
    validation: {
      // require these zcaps (by reference ID)
      zcapReferenceIds: [{
        referenceId: 'issue',
        required: true
      }],
      async usageAggregator({meter, signal} = {}) {
        return usageAggregator({meter, signal, service});
      }
    }
  });

  bedrock.events.on('bedrock-express.configure.routes', async app => {
    await addRoutes({app, service});
  });

  // initialize vc-status service agent early (after database is ready) if
  // KMS system is externalized; otherwise we must wait until KMS system
  // is ready
  const externalKms = !bedrock.config['service-agent'].kms.baseUrl.startsWith(
    bedrock.config.server.baseUri);
  const event = externalKms ? 'bedrock-mongodb.ready' : 'bedrock.ready';
  bedrock.events.on(event, async () => {
    await initializeServiceAgent({serviceType});
  });
});

async function usageAggregator({meter, signal, service} = {}) {
  const {id: meterId} = meter;
  // FIXME: add SLCs storage
  return service.configStorage.getUsage({meterId, signal});
}
