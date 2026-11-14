const { Client: ElasticsearchClient } = require('@elastic/elasticsearch');
const { Client: OpenSearchClient } = require('@opensearch-project/opensearch');
const fs = require('fs');

/**
 * Normalizes host/node configuration into a valid URL or array of URLs.
 * @param {Object|string} endpointConfig
 * @returns {string|string[]}
 */
function normalizeNode(endpointConfig) {
  if (!endpointConfig) {
    throw new Error('Endpoint configuration is missing');
  }

  if (typeof endpointConfig === 'string') {
    return endpointConfig.startsWith('http://') || endpointConfig.startsWith('https://')
      ? endpointConfig
      : `http://${endpointConfig}`;
  }

  if (endpointConfig.node) {
    return endpointConfig.node;
  }

  if (endpointConfig.nodes) {
    return endpointConfig.nodes;
  }

  if (endpointConfig.host) {
    const host = endpointConfig.host;
    if (Array.isArray(host)) {
      return host.map(h => (h.startsWith('http://') || h.startsWith('https://') ? h : `http://${h}`));
    }
    return host.startsWith('http://') || host.startsWith('https://') ? host : `http://${host}`;
  }

  throw new Error('No valid node, nodes, or host specified in configuration');
}

/**
 * Builds TLS/SSL configuration options.
 * @param {Object} endpointConfig
 * @returns {Object|undefined}
 */
function buildTlsConfig(endpointConfig) {
  const tls = endpointConfig.tls || endpointConfig.ssl;
  if (!tls) return undefined;

  const tlsOpts = {};
  if (typeof tls.rejectUnauthorized === 'boolean') {
    tlsOpts.rejectUnauthorized = tls.rejectUnauthorized;
  }

  if (tls.ca) {
    tlsOpts.ca = fs.existsSync(tls.ca) ? fs.readFileSync(tls.ca) : tls.ca;
  }
  if (tls.cert) {
    tlsOpts.cert = fs.existsSync(tls.cert) ? fs.readFileSync(tls.cert) : tls.cert;
  }
  if (tls.key) {
    tlsOpts.key = fs.existsSync(tls.key) ? fs.readFileSync(tls.key) : tls.key;
  }

  return tlsOpts;
}

/**
 * Creates an Elasticsearch or OpenSearch client instance.
 * @param {Object} endpointConfig
 * @returns {ElasticsearchClient|OpenSearchClient}
 */
function createClient(endpointConfig) {
  const node = normalizeNode(endpointConfig);
  const clientType = (endpointConfig.type || endpointConfig.clientType || 'elasticsearch').toLowerCase();

  const clientOpts = {
    node,
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
  const tls = buildTlsConfig(endpointConfig);
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
 * @param {ElasticsearchClient|OpenSearchClient} client
 * @param {string} label
 * @returns {Promise<Object>}
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
  normalizeNode,
};
