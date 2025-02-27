/*!
 * Copyright (c) 2020-2025 Digital Bazaar, Inc. All rights reserved.
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
  describe('/status-lists', () => {
    it('creates a "StatusList2021" status list', async () => {
      const statusListId = `${statusInstanceId}/status-lists/${uuid()}`;
      const statusListOptions = {
        credentialId: statusListId,
        type: 'StatusList2021',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      let error;
      let result;
      try {
        result = await helpers.createStatusList({
          url: statusListId,
          capabilityAgent,
          capability: statusInstanceRootZcap,
          statusListOptions
        });
      } catch(e) {
        error = e;
      }
      assertNoError(error);
      should.exist(result.id);
      result.id.should.equal(statusListId);

      // get status list and make assertions on it
      const slc = await helpers.getStatusListCredential({statusListId});
      should.exist(slc);
      slc.should.include.keys([
        'id', 'credentialSubject', 'issuanceDate', 'expirationDate'
      ]);
      slc.id.should.equal(statusListOptions.credentialId);
      slc.id.should.equal(statusListId);
      slc.credentialSubject.should.include.keys([
        'id', 'type', 'encodedList', 'statusPurpose'
      ]);
    });

    it('creates a "BitstringStatusList" status list size=2^17', async () => {
      const statusListId = `${statusInstanceId}/status-lists/${uuid()}`;
      const statusListOptions = {
        credentialId: statusListId,
        type: 'BitstringStatusList',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      let error;
      let result;
      try {
        result = await helpers.createStatusList({
          url: statusListId,
          capabilityAgent,
          capability: statusInstanceRootZcap,
          statusListOptions
        });
      } catch(e) {
        error = e;
      }
      assertNoError(error);
      should.exist(result.id);
      result.id.should.equal(statusListId);

      // get status list and make assertions on it
      const slc = await helpers.getStatusListCredential({statusListId});
      should.exist(slc);
      slc.should.include.keys([
        'id', 'credentialSubject', 'validFrom', 'validUntil'
      ]);
      slc.id.should.equal(statusListOptions.credentialId);
      slc.id.should.equal(statusListId);
      slc.credentialSubject.should.include.keys([
        'id', 'type', 'encodedList', 'statusPurpose'
      ]);
    });

    it('creates a "BitstringStatusList" status list size=2^26', async () => {
      const statusListId = `${statusInstanceId}/status-lists/${uuid()}`;
      const statusListOptions = {
        credentialId: statusListId,
        type: 'BitstringStatusList',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 67108864,
        statusPurpose: 'revocation'
      };
      let error;
      let result;
      try {
        result = await helpers.createStatusList({
          url: statusListId,
          capabilityAgent,
          capability: statusInstanceRootZcap,
          statusListOptions
        });
      } catch(e) {
        error = e;
      }
      assertNoError(error);
      should.exist(result.id);
      result.id.should.equal(statusListId);

      // get status list and make assertions on it
      const slc = await helpers.getStatusListCredential({statusListId});
      should.exist(slc);
      slc.should.include.keys([
        'id', 'credentialSubject', 'validFrom', 'validUntil'
      ]);
      slc.id.should.equal(statusListOptions.credentialId);
      slc.id.should.equal(statusListId);
      slc.credentialSubject.should.include.keys([
        'id', 'type', 'encodedList', 'statusPurpose'
      ]);
    });

    it('creates a status list with non-equal credential ID', async () => {
      // suffix must match
      const suffix = `/status-lists/${uuid()}`;
      const statusListId = `${statusInstanceId}${suffix}`;
      const statusListOptions = {
        credentialId: `https://foo.example/anything/111${suffix}`,
        type: 'BitstringStatusList',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      let error;
      let result;
      try {
        result = await helpers.createStatusList({
          url: statusListId,
          capabilityAgent,
          capability: statusInstanceRootZcap,
          statusListOptions
        });
      } catch(e) {
        error = e;
      }
      assertNoError(error);
      should.exist(result.id);
      result.id.should.equal(statusListId);

      // get status list and make assertions on it
      const slc = await helpers.getStatusListCredential({statusListId});
      should.exist(slc);
      slc.should.include.keys([
        'id', 'credentialSubject', 'validFrom', 'validUntil'
      ]);
      slc.id.should.equal(statusListOptions.credentialId);
      slc.id.should.not.equal(statusListId);
      slc.credentialSubject.should.include.keys([
        'id', 'type', 'encodedList', 'statusPurpose'
      ]);
    });

    it('create fails w/ non-matching credential ID suffix', async () => {
      // suffix must match
      const localId = uuid();
      const suffix = `/status-lists/${localId}`;
      const statusListId = `${statusInstanceId}${suffix}`;
      const statusListOptions = {
        credentialId: `https://foo.example/not-allowed/${localId}`,
        type: 'BitstringStatusList',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      let error;
      let result;
      try {
        result = await helpers.createStatusList({
          url: statusListId,
          capabilityAgent,
          capability: statusInstanceRootZcap,
          statusListOptions
        });
      } catch(e) {
        error = e;
      }
      should.not.exist(result);
      should.exist(error);
      error.data.message.should.equal(
        'Credential ID must end in status list suffix ' +
        `("/status-lists/${localId}").`);
    });

    it('creates a terse "BitstringStatusList" status list', async () => {
      const statusListId = `${statusInstanceId}/status-lists/revocation/0`;
      const statusListOptions = {
        credentialId: statusListId,
        type: 'BitstringStatusList',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      let error;
      let result;
      try {
        result = await helpers.createStatusList({
          url: statusListId,
          capabilityAgent,
          capability: statusInstanceRootZcap,
          statusListOptions
        });
      } catch(e) {
        error = e;
      }
      assertNoError(error);
      should.exist(result.id);
      result.id.should.equal(statusListId);

      // get status list and make assertions on it
      const slc = await helpers.getStatusListCredential({statusListId});
      should.exist(slc);
      slc.should.include.keys([
        'id', 'credentialSubject', 'validFrom', 'validUntil'
      ]);
      slc.id.should.equal(statusListId);
      slc.credentialSubject.should.include.keys([
        'id', 'type', 'encodedList', 'statusPurpose'
      ]);
    });

    it('creates a terse status list with non-equal credential ID', async () => {
      // suffix must match
      const suffix = `/status-lists/revocation/0`;
      const statusListId = `${statusInstanceId}${suffix}`;
      const statusListOptions = {
        credentialId: `https://foo.example/anything/111${suffix}`,
        type: 'BitstringStatusList',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      let error;
      let result;
      try {
        result = await helpers.createStatusList({
          url: statusListId,
          capabilityAgent,
          capability: statusInstanceRootZcap,
          statusListOptions
        });
      } catch(e) {
        error = e;
      }
      assertNoError(error);
      should.exist(result.id);
      result.id.should.equal(statusListId);

      // get status list and make assertions on it
      const slc = await helpers.getStatusListCredential({statusListId});
      should.exist(slc);
      slc.should.include.keys([
        'id', 'credentialSubject', 'validFrom', 'validUntil'
      ]);
      slc.id.should.equal(statusListOptions.credentialId);
      slc.id.should.not.equal(statusListId);
      slc.credentialSubject.should.include.keys([
        'id', 'type', 'encodedList', 'statusPurpose'
      ]);
    });

    it('create terse fails w/ non-matching credential ID suffix', async () => {
      // suffix must match
      const suffix = `/status-lists/revocation/0`;
      const statusListId = `${statusInstanceId}${suffix}`;
      const statusListOptions = {
        credentialId: `https://foo.example/not-allowed/revocation/0`,
        type: 'BitstringStatusList',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      let error;
      let result;
      try {
        result = await helpers.createStatusList({
          url: statusListId,
          capabilityAgent,
          capability: statusInstanceRootZcap,
          statusListOptions
        });
      } catch(e) {
        error = e;
      }
      should.not.exist(result);
      should.exist(error);
      error.data.message.should.equal(
        'Credential ID must end in status list suffix ' +
        '("/status-lists/revocation/0").');
    });
  });

  describe('/credentials/status', () => {
    it('updates a "StatusList2021" revocation status', async () => {
      // first create a status list
      const statusListId = `${statusInstanceId}/status-lists/${uuid()}`;
      const statusListOptions = {
        credentialId: statusListId,
        type: 'StatusList2021',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      const {id: statusListCredential} = await helpers.createStatusList({
        url: statusListId,
        capabilityAgent,
        capability: statusInstanceRootZcap,
        statusListOptions
      });

      // pretend a VC with this `credentialId` has been issued
      const credentialId = `urn:uuid:${uuid()}`;
      const statusListIndex = '0';

      // get VC status
      const statusInfo = await helpers.getCredentialStatus({
        statusListCredential, statusListIndex
      });
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
            indexAllocator: statusListOptions.indexAllocator,
            credentialStatus: {
              type: 'StatusList2021Entry',
              statusPurpose: 'revocation',
              statusListCredential,
              statusListIndex
            }
          }
        });
      } catch(e) {
        error = e;
      }
      assertNoError(error);

      // force refresh status list
      await zcapClient.write({
        url: `${statusListCredential}?refresh=true`,
        capability: statusInstanceRootZcap,
        json: {}
      });

      // check status of VC has changed
      ({status} = await helpers.getCredentialStatus({
        statusListCredential, statusListIndex
      }));
      status.should.equal(true);
    });

    it('updates a "BitstringStatusList" revocation status', async () => {
      // first create a status list
      const statusListId = `${statusInstanceId}/status-lists/${uuid()}`;
      const statusListOptions = {
        credentialId: statusListId,
        type: 'BitstringStatusList',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      const {id: statusListCredential} = await helpers.createStatusList({
        url: statusListId,
        capabilityAgent,
        capability: statusInstanceRootZcap,
        statusListOptions
      });

      // pretend a VC with this `credentialId` has been issued
      const credentialId = `urn:uuid:${uuid()}`;
      const statusListIndex = '0';

      // get VC status
      const statusInfo = await helpers.getCredentialStatus({
        statusListCredential, statusListIndex
      });
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
            indexAllocator: statusListOptions.indexAllocator,
            credentialStatus: {
              type: 'BitstringStatusListEntry',
              statusPurpose: 'revocation',
              statusListCredential,
              statusListIndex
            }
          }
        });
      } catch(e) {
        error = e;
      }
      assertNoError(error);

      // force refresh status list
      await zcapClient.write({
        url: `${statusListCredential}?refresh=true`,
        capability: statusInstanceRootZcap,
        json: {}
      });

      // check status of VC has changed
      ({status} = await helpers.getCredentialStatus({
        statusListCredential, statusListIndex
      }));
      status.should.equal(true);
    });

    it('fails to set status when no "indexAllocator" given', async () => {
      // first create a status list
      const statusListId = `${statusInstanceId}/status-lists/${uuid()}`;
      const statusListOptions = {
        credentialId: statusListId,
        type: 'BitstringStatusList',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      const {id: statusListCredential} = await helpers.createStatusList({
        url: statusListId,
        capabilityAgent,
        capability: statusInstanceRootZcap,
        statusListOptions
      });

      // pretend a VC with this `credentialId` has been issued
      const credentialId = `urn:uuid:${uuid()}`;
      const statusListIndex = '0';

      // get VC status, should work w/ initialized `false` value
      const statusInfo = await helpers.getCredentialStatus({
        statusListCredential, statusListIndex
      });
      const {status} = statusInfo;
      status.should.equal(false);

      // try to revoke VC w/o `indexAllocator`
      const zcapClient = helpers.createZcapClient({capabilityAgent});
      let error;
      try {
        await zcapClient.write({
          url: `${statusInstanceId}/credentials/status`,
          capability: statusInstanceRootZcap,
          json: {
            credentialId,
            credentialStatus: {
              type: 'BitstringStatusListEntry',
              statusPurpose: 'revocation',
              statusListCredential,
              statusListIndex
            }
          }
        });
      } catch(e) {
        error = e;
      }
      should.exist(error);
      error.data.message.should.equal(
        '"indexAllocator" is required when setting the status of a ' +
        'credential the first time.');
    });

    it('updates a terse "BitstringStatusList" revocation status', async () => {
      // first create a terse status list
      const statusListId = `${statusInstanceId}/status-lists/revocation/0`;
      const statusListOptions = {
        credentialId: statusListId,
        type: 'BitstringStatusList',
        indexAllocator: `urn:uuid:${uuid()}`,
        length: 131072,
        statusPurpose: 'revocation'
      };
      const {id: statusListCredential} = await helpers.createStatusList({
        url: statusListId,
        capabilityAgent,
        capability: statusInstanceRootZcap,
        statusListOptions
      });

      // pretend a VC with this `credentialId` has been issued
      const credentialId = `urn:uuid:${uuid()}`;
      const statusListIndex = '0';

      // get VC status
      const statusInfo = await helpers.getCredentialStatus({
        statusListCredential, statusListIndex
      });
      let {status} = statusInfo;
      status.should.equal(false);

      // then revoke VC
      const zcapClient = helpers.createZcapClient({capabilityAgent});
      {
        let error;
        try {
          await zcapClient.write({
            url: `${statusInstanceId}/credentials/status`,
            capability: statusInstanceRootZcap,
            json: {
              credentialId,
              indexAllocator: statusListOptions.indexAllocator,
              credentialStatus: {
                type: 'BitstringStatusListEntry',
                statusPurpose: 'revocation',
                statusListCredential,
                statusListIndex
              }
            }
          });
        } catch(e) {
          error = e;
        }
        assertNoError(error);
      }

      // force refresh status list
      await zcapClient.write({
        url: `${statusListCredential}?refresh=true`,
        capability: statusInstanceRootZcap,
        json: {}
      });

      // check status of VC has changed
      ({status} = await helpers.getCredentialStatus({
        statusListCredential, statusListIndex
      }));
      status.should.equal(true);

      // then unrevoke VC to ensure it can be switched back
      {
        let error;
        try {
          await zcapClient.write({
            url: `${statusInstanceId}/credentials/status`,
            capability: statusInstanceRootZcap,
            json: {
              credentialId,
              indexAllocator: statusListOptions.indexAllocator,
              credentialStatus: {
                type: 'BitstringStatusListEntry',
                statusPurpose: 'revocation',
                statusListCredential,
                statusListIndex
              },
              status: false
            }
          });
        } catch(e) {
          error = e;
        }
        assertNoError(error);
      }

      // force refresh status list
      await zcapClient.write({
        url: `${statusListCredential}?refresh=true`,
        capability: statusInstanceRootZcap,
        json: {}
      });

      // check status of VC has changed
      ({status} = await helpers.getCredentialStatus({
        statusListCredential, statusListIndex
      }));
      status.should.equal(false);

      // then revoke VC again with only status type and purpose now that
      // it has been registered with the status system
      {
        let error;
        try {
          await zcapClient.write({
            url: `${statusInstanceId}/credentials/status`,
            capability: statusInstanceRootZcap,
            json: {
              credentialId,
              credentialStatus: {
                type: 'BitstringStatusListEntry',
                statusPurpose: 'revocation'
              },
              status: true
            }
          });
        } catch(e) {
          error = e;
        }
        assertNoError(error);
      }

      // force refresh status list
      await zcapClient.write({
        url: `${statusListCredential}?refresh=true`,
        capability: statusInstanceRootZcap,
        json: {}
      });

      // check status of VC has changed
      ({status} = await helpers.getCredentialStatus({
        statusListCredential, statusListIndex
      }));
      status.should.equal(true);

      // then unrevoke VC again with only status type and purpose now that
      // it has been registered with the status system
      {
        let error;
        try {
          await zcapClient.write({
            url: `${statusInstanceId}/credentials/status`,
            capability: statusInstanceRootZcap,
            json: {
              credentialId,
              credentialStatus: {
                type: 'BitstringStatusListEntry',
                statusPurpose: 'revocation'
              },
              status: false
            }
          });
        } catch(e) {
          error = e;
        }
        assertNoError(error);
      }

      // force refresh status list
      await zcapClient.write({
        url: `${statusListCredential}?refresh=true`,
        capability: statusInstanceRootZcap,
        json: {}
      });

      // check status of VC has changed
      ({status} = await helpers.getCredentialStatus({
        statusListCredential, statusListIndex
      }));
      status.should.equal(false);
    });
  });
});
