/*!
 * Copyright (c) 2020-2024 Digital Bazaar, Inc. All rights reserved.
 */
import * as helpers from './helpers.js';
import {v4 as uuid} from 'uuid';

describe('status APIs', () => {
  let capabilityAgent;
  let statusInstanceId;
  let statusInstanceRootZcap;
  beforeEach(async () => {
    const deps = await helpers.provisionDependencies();
    const {
      statusIssueZcap
    } = deps;
    ({capabilityAgent} = deps);

    // create exchanger instance w/ oauth2-based authz
    const zcaps = {
      issue: statusIssueZcap
    };
    const statusConfig = await helpers.createStatusConfig(
      {capabilityAgent, zcaps, oauth2: true});
    statusInstanceId = statusConfig.id;
    statusInstanceRootZcap =
      `urn:zcap:root:${encodeURIComponent(statusInstanceId)}`;
  });
  describe('/slcs', () => {
    it('creates a "StatusList2021" status list', async () => {
      const statusListOptions = {
        // FIXME: needs to support both:
        // /<listId>
        // /statusPurpose/<listIndex>
        id: `${statusInstanceId}/slcs/${uuid()}`,
        type: 'StatusList2021',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      let error;
      let result;
      try {
        result = await helpers.createStatusList({
          url: `${statusInstanceId}/slcs`,
          capabilityAgent,
          capability: statusInstanceRootZcap,
          statusListOptions
        });
      } catch(e) {
        error = e;
      }
      assertNoError(error);
      should.exist(result.id);
      result.id.should.equal(statusListOptions.id);

      // FIXME: get status list and make assertions on it
    });
  });

  describe.skip('/credentials/status', () => {
    // FIXME: add "BitstringStatusList" test
    // FIXME: add "BitstringStatusList" test w/"<statusPurpose>/<listIndex>" id
    it('updates a "StatusList2021" revocation credential status',
      async () => {
        // FIXME: first create a status list
        const statusListOptions = {
          // FIXME: needs to support both:
          // /<listId>
          // /statusPurpose/<listIndex>
          id: `${statusInstanceId}/slcs/${uuid()}`,
          type: 'StatusList2021',
          indexAllocator: `urn:uuid:${uuid()}`,
          length: 131072,
          statusPurpose: 'revocation'
        };
        const {id: statusListCredential} = await helpers.createStatusList({
          url: `${statusInstanceId}/slcs`,
          capabilityAgent,
          capability: statusInstanceRootZcap,
          statusListOptions
        });

        // pretend a VC with this `credentialId` has been issued
        const credentialId = `urn:uuid:${uuid()}`;

        // get VC status
        const statusInfo = await helpers.getCredentialStatus({credentialId});
        let {status} = statusInfo;
        status.should.equal(false);

        // then revoke VC
        const zcapClient = helpers.createZcapClient({capabilityAgent});
        let error;
        try {
          await zcapClient.write({
            url: `${statusInstanceId}/credentials/status`,
            capability: statusInstanceRootZcap,
            json: {
              credentialId,
              credentialStatus: {
                type: 'StatusList2021Entry',
                statusPurpose: 'revocation',
                statusListCredential,
                statusListIndex: 0
              }
            }
          });
        } catch(e) {
          error = e;
        }
        assertNoError(error);

        // force publication of new SLC
        await zcapClient.write({
          url: `${statusInstanceId}/publish`,
          capability: statusInstanceRootZcap,
          json: {}
        });

        // check status of VC has changed
        ({status} = await helpers.getCredentialStatus({credentialId}));
        status.should.equal(true);
      });
  });
});
