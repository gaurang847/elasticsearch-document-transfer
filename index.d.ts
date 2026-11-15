import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { Readable, Writable, Transform } from 'node:stream';

export interface ClientAuthConfig {
  username?: string;
  password?: string;
  apiKey?: string;
  bearer?: string;
}

export interface ClientTlsConfig {
  rejectUnauthorized?: boolean;
  ca?: string | Buffer;
  cert?: string | Buffer;
  key?: string | Buffer;
}

export interface EndpointConfig {
  node: string | string[];
  type?: 'elasticsearch' | 'opensearch';
  auth?: ClientAuthConfig;
  username?: string;
  password?: string;
  apiKey?: string;
  tls?: ClientTlsConfig;
  headers?: Record<string, string>;
  requestTimeout?: number;
  maxRetries?: number;
}

export interface ClusterPingResult {
  connected: boolean;
  label: string;
  version: string;
  clusterName: string;
  distribution: string;
  raw: any;
}

export interface SourceConfig {
  node: string | string[];
  type?: 'elasticsearch' | 'opensearch';
  index: string;
  query?: Record<string, any>;
  batchSize?: number;
  cursorMode?: 'scroll' | 'search_after';
  scrollTime?: string;
  sort?: any[];
  sourceFields?: string[];
  auth?: ClientAuthConfig;
  username?: string;
  password?: string;
  apiKey?: string;
  tls?: ClientTlsConfig;
  headers?: Record<string, string>;
}

export interface TargetElasticsearchConfig {
  enabled?: boolean;
  node?: string | string[];
  type?: 'elasticsearch' | 'opensearch';
  index?: string;
  batchSize?: number;
  importMapping?: boolean;
  useDocCountAsId?: boolean;
  action?: 'index' | 'create' | 'update';
  maxRetries?: number;
  retryDelayMs?: number;
  auth?: ClientAuthConfig;
  username?: string;
  password?: string;
  apiKey?: string;
  tls?: ClientTlsConfig;
  headers?: Record<string, string>;
}

export type FileOutputFormat = 'bulk' | 'source' | 'document';

export interface TargetFileConfig {
  enabled?: boolean;
  filePath?: string;
  dirPath?: string;
  format?: FileOutputFormat;
  gzip?: boolean;
}

export interface TargetConfig {
  elasticsearch?: TargetElasticsearchConfig;
  file?: TargetFileConfig;
}

export interface TransformedDocument {
  _id?: string;
  _index?: string;
  _source: Record<string, any>;
  _original?: any;
}

export interface TransformConfig {
  fn?: (doc: TransformedDocument, count: number) => TransformedDocument | null | Promise<TransformedDocument | null>;
  customId?: (hit: any, count: number) => string;
}

export interface TransferConfig {
  source: SourceConfig;
  target: TargetConfig;
  transform?: TransformConfig;
  silent?: boolean;
}

export interface TransferSummary {
  success: boolean;
  transferred: number;
  failed: number;
  durationMs: number;
}

export interface PipelineComponents {
  sourceStream: Readable;
  transformStream: Transform;
  compositeTarget: Writable;
  elasticTargetStream: Writable | null;
  fileTargetStream: Writable | null;
}

export function transfer(configOrPath?: TransferConfig | string): Promise<TransferSummary>;
export function resolveConfig(configOrPath?: TransferConfig | string): Promise<TransferConfig>;
export function loadConfigFile(customPath?: string): Promise<TransferConfig>;
export function normalizeConfig(rawConfig: any): TransferConfig;
export function createClient(config: EndpointConfig): Promise<ElasticsearchClient | OpenSearchClient>;
export function pingClient(client: any, label?: string): Promise<ClusterPingResult>;
export function createPipeline(options: {
  config: TransferConfig;
  sourceClient: any;
  targetClient?: any;
}): PipelineComponents;
