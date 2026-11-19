const { Client: ElasticsearchClient } = require('@elastic/elasticsearch');
const { Client: OpenSearchClient } = require('@opensearch-project/opensearch');
const { readFile } = require('node:fs/promises');

/**
 * Resolves a certificate, key, or CA by loading it from disk if a file path is provided.
 * @param {string|Buffer} [fileOrContent] - File path or raw certificate content
 * @returns {Promise<string|Buffer|undefined>}
 */
async function resolveCertificate(fileOrContent) {
  if (!fileOrContent) return undefined;

  if (typeof fileOrContent === 'string' && !fileOrContent.includes('-----BEGIN')) {
    try {
      return await readFile(fileOrContent);
    } catch {
      return fileOrContent;
    }
  }

  return fileOrContent;
}

/**
 * Asynchronously builds TLS/SSL configuration options.
 * @param {import('../types').EndpointConfig} endpointConfig - Endpoint configuration object
 * @returns {Promise<Object|undefined>}
 */
async function buildTlsConfig(endpointConfig) {
  const tls = endpointConfig.tls;
  if (!tls) return undefined;

  const [ca, cert, key] = await Promise.all([
    resolveCertificate(tls.ca),
    resolveCertificate(tls.cert),
    resolveCertificate(tls.key),
  ]);

  const tlsOpts = {};
  if (typeof tls.rejectUnauthorized === 'boolean') {
    tlsOpts.rejectUnauthorized = tls.rejectUnauthorized;
  }
  if (ca) tlsOpts.ca = ca;
  if (cert) tlsOpts.cert = cert;
  if (key) tlsOpts.key = key;

  return tlsOpts;
}

/**
 * Creates an Elasticsearch or OpenSearch client instance.
 * @param {import('../types').EndpointConfig} endpointConfig - Connection configuration
 * @returns {Promise<ElasticsearchClient|OpenSearchClient>} Connected client instance
 */
async function createClient(endpointConfig) {
  if (!endpointConfig || !endpointConfig.node) {
    throw new Error('Endpoint configuration error: "node" URL is required.');
  }

  const clientType = (endpointConfig.type || 'elasticsearch').toLowerCase();

  const clientOpts = {
    node: endpointConfig.node,
    requestTimeout: endpointConfig.requestTimeout || 60000,
    maxRetries: endpointConfig.maxRetries || 3,
  };

  // Auth configuration
  if (endpointConfig.auth) {
    clientOpts.auth = endpointConfig.auth;
  } else if (endpointConfig.username && endpointConfig.password) {
    clientOpts.auth = {
      username: endpointConfig.username,
      password: endpointConfig.password,
    };
  } else if (endpointConfig.apiKey) {
    clientOpts.auth = {
      apiKey: endpointConfig.apiKey,
    };
  }

  // TLS / SSL configuration
  const tls = await buildTlsConfig(endpointConfig);
  if (tls) {
    clientOpts.tls = tls;
    clientOpts.ssl = tls; // OpenSearch uses ssl
  }

  // Headers
  if (endpointConfig.headers) {
    clientOpts.headers = endpointConfig.headers;
  }

  if (clientType === 'opensearch') {
    return new OpenSearchClient(clientOpts);
  }

  return new ElasticsearchClient(clientOpts);
}

/**
 * Pings and inspects the client cluster.
 * @param {ElasticsearchClient|OpenSearchClient} client - Connected client
 * @param {string} [label='client'] - Label for display
 * @returns {Promise<import('../types').ClusterPingResult>}
 */
async function pingClient(client, label = 'client') {
  try {
    let info;
    if (typeof client.info === 'function') {
      const response = await client.info();
      info = response.body || response;
    } else {
      await client.ping();
      info = { status: 'ok' };
    }

    const version = info.version?.number || 'unknown';
    const clusterName = info.cluster_name || 'unknown';
    const distribution = info.version?.distribution || (info.tagline?.includes('OpenSearch') ? 'opensearch' : 'elasticsearch');

    return {
      connected: true,
      label,
      version,
      clusterName,
      distribution,
      raw: info,
    };
  } catch (err) {
    const errorMsg = `Failed to connect to ${label} (${err.message})`;
    const error = new Error(errorMsg);
    error.originalError = err;
    throw error;
  }
}

module.exports = {
  createClient,
  pingClient,
  buildTlsConfig,
  resolveCertificate,
};
