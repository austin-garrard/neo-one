/* @flow */
import Client from './Client';
import {
  type LocalStore,
  LocalKeyStore,
  LocalMemoryStore,
  LocalUserAccountProvider,
} from './user';
import {
  type NEOONEProviderOptions,
  NEOONEDataProvider,
  NEOONEProvider,
} from './provider';
import type { Network } from './types'; // eslint-disable-line
import ReadClient from './ReadClient';

import * as networks from './networks';

export const localClient = async (optionsIn?: {|
  store?: LocalStore,
  mainRPCURL?: string,
  testRPCURL?: string,
  options?: Array<NEOONEProviderOptions>,
|}) => {
  const { store, mainRPCURL, testRPCURL, options } = optionsIn || {};
  const keystore = await LocalKeyStore.create({
    store: store || new LocalMemoryStore(),
  });
  return new Client(
    new LocalUserAccountProvider({
      keystore,
      provider: new NEOONEProvider({
        mainRPCURL,
        testRPCURL,
        options,
      }),
    }),
  );
};

export const mainReadClient = (optionsIn?: {|
  rpcURL?: string,
  iterBlocksFetchTimeoutMS?: number,
|}) => {
  const { rpcURL, iterBlocksFetchTimeoutMS } = optionsIn || {};
  return new ReadClient(
    new NEOONEDataProvider({
      network: networks.MAIN,
      rpcURL: rpcURL == null ? networks.MAIN_URL : rpcURL,
      iterBlocksFetchTimeoutMS,
    }),
  );
};

export const testReadClient = (optionsIn?: {|
  rpcURL?: string,
  iterBlocksFetchTimeoutMS?: number,
|}) => {
  const { rpcURL, iterBlocksFetchTimeoutMS } = optionsIn || {};
  return new ReadClient(
    new NEOONEDataProvider({
      network: networks.TEST,
      rpcURL: rpcURL == null ? networks.TEST_URL : rpcURL,
      iterBlocksFetchTimeoutMS,
    }),
  );
};

export const readClient = ({
  network,
  rpcURL,
  iterBlocksFetchTimeoutMS,
}: {|
  network: Network,
  rpcURL: string,
  iterBlocksFetchTimeoutMS?: number,
|}) =>
  new ReadClient(
    new NEOONEDataProvider({
      network,
      rpcURL,
      iterBlocksFetchTimeoutMS,
    }),
  );
