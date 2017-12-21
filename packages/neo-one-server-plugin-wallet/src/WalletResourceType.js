/* @flow */
import {
  type MasterResourceAdapter,
  type MasterResourceAdapterOptions,
  CRUD,
  ResourceType,
} from '@neo-one/server';
import {
  type DescribeTable,
  type ListTable,
  type ResourceState,
} from '@neo-one/server-common';
import { LocalFileStore } from '@neo-one/client-node';

import _ from 'lodash';
import { localClient } from '@neo-one/client';
import path from 'path';

import {
  StartWalletCRUD,
  StopWalletCRUD,
  DeleteWalletCRUD,
  CreateWalletCRUD,
  GetWalletCRUD,
  DescribeWalletCRUD,
} from './crud';
import MasterWalletResourceAdapter from './MasterWalletResourceAdapter';
import type WalletPlugin from './WalletPlugin';

export type Coin = {|
  asset: string,
  amount: string,
|};
export type Wallet = {|
  plugin: string,
  resourceType: string,
  name: string,
  baseName: string,
  state: ResourceState,
  network: string,
  address: string,
  unlocked: boolean,
  neoBalance: string,
  gasBalance: string,
  privateKey: ?string,
  nep2: ?string,
  publicKey: string,
  scriptHash: string,
  balance: Array<Coin>,
|};
export type WalletResourceOptions = {|
  network: string,
  password?: string,
  privateKey?: string,
|};

const WALLETS_PATH = 'wallets';

export default class WalletResourceType extends ResourceType<
  Wallet,
  WalletResourceOptions,
> {
  constructor({ plugin }: {| plugin: WalletPlugin |}) {
    super({
      plugin,
      name: 'wallet',
      names: {
        capital: 'Wallet',
        capitalPlural: 'Wallets',
        lower: 'wallet',
        lowerPlural: 'wallets',
      },
    });
  }

  async createMasterResourceAdapter({
    pluginManager,
    dataPath,
  }: MasterResourceAdapterOptions): Promise<
    MasterResourceAdapter<Wallet, WalletResourceOptions>,
  > {
    const client = await localClient({
      store: new LocalFileStore({
        dataPath: path.resolve(dataPath, WALLETS_PATH),
      }),
    });
    return new MasterWalletResourceAdapter({
      client,
      pluginManager,
      resourceType: this,
    });
  }

  getCRUD(): CRUD<Wallet, WalletResourceOptions> {
    return new CRUD({
      resourceType: this,
      start: new StartWalletCRUD({ resourceType: this }),
      stop: new StopWalletCRUD({ resourceType: this }),
      delete: new DeleteWalletCRUD({ resourceType: this }),
      create: new CreateWalletCRUD({ resourceType: this }),
      get: new GetWalletCRUD({ resourceType: this }),
      describe: new DescribeWalletCRUD({ resourceType: this }),
    });
  }

  getListTable(resources: Array<Wallet>): ListTable {
    return [['Wallet', 'Name', 'Address', 'Unlocked', 'NEO', 'GAS']].concat(
      _.sortBy(resources, resource => resource.name).map(resource => [
        resource.network,
        resource.baseName,
        resource.address,
        resource.unlocked ? 'Yes' : 'No',
        resource.neoBalance,
        resource.gasBalance,
      ]),
    );
  }

  getDescribeTable(resource: Wallet): DescribeTable {
    return [
      ['Network', resource.network],
      ['Name', resource.baseName],
      ['Unlocked', resource.unlocked ? 'Yes' : 'No'],
      [
        'Private Key',
        resource.privateKey == null ? 'Locked' : resource.privateKey,
      ],
      resource.nep2 == null ? null : ['NEP2', resource.nep2],
      ['Public Key', resource.publicKey],
      ['Address', resource.address],
      ['Script Hash', resource.scriptHash],
      [
        'Balance',
        {
          type: 'list',
          table: [['Asset', 'Amount']].concat(
            _.sortBy(resource.balance, coin => coin.asset).map(coin => [
              coin.asset,
              coin.amount,
            ]),
          ),
        },
      ],
    ].filter(Boolean);
  }
}
