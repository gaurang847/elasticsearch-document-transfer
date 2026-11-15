const { Client: ElasticsearchClient } = require('@elastic/elasticsearch');
const { Client: OpenSearchClient } = require('@opensearch-project/opensearch');
const { readFile } = require('node:fs/promises');

/**
 * @typedef {Object} ClientAuthConfig
 * @property {string} [username] - Basic auth username
 * @property {string} [password] - Basic auth password
 * @property {string} [apiKey] - API key string or encoded token
 * @property {string} [bearer] - Bearer token
 */

/**
 * @typedef {Object} ClientTlsConfig
 * @property {boolean} [rejectUnauthorized] - Whether to reject unauthorized SSL/TLS certificates
 * @property {string|Buffer} [ca] - Certificate Authority path or certificate content
 * @property {string|Buffer} [cert] - Client certificate path or content
 * @property {string|Buffer} [key] - Client private key path or content
 */

/**
 * @typedef {Object} EndpointConfig
 * @property {string|string[]} node - Elasticsearch or OpenSearch cluster URL(s)
 * @property {'elasticsearch'|'opensearch'} [type='elasticsearch'] - Target client engine
 * @property {ClientAuthConfig} [auth] - Authentication options
 * @property {string} [username] - Direct basic auth username
 * @property {string} [password] - Direct basic auth password
 * @property {string} [apiKey] - Direct API key
 * @property {ClientTlsConfig} [tls] - TLS/SSL options
 * @property {Record<string, string>} [headers] - Custom HTTP request headers
 * @property {number} [requestTimeout=60000] - Request timeout in milliseconds
 * @property {number} [maxRetries=3] - Maximum retry attempts
 */

/**
 * @typedef {Object} ClusterPingResult
 * @property {boolean} connected - Connection status
 * @property {string} label - Human-readable label (e.g. 'Source')
 * @property {string} version - Cluster version number (e.g. '8.13.4')
 * @property {string} clusterName - Name of the cluster
 * @property {string} distribution - Engine distribution ('elasticsearch' or 'opensearch')
 * @property {Object} raw - Raw info object returned from server
 */

/**
 * Asynchronously builds TLS/SSL configuration options using fs/promises.
 * @param {EndpointConfig} endpointConfig - Endpoint configuration object
 * @returns {Promise<Object|undefined>}
 */
async function buildTlsConfig(endpointConfig) {
  const tls = endpointConfig.tls;
  if (!tls) return undefined;

  const tlsOpts = {};
  if (typeof tls.rejectUnauthorized === 'boolean') {
    tlsOpts.rejectUnauthorized = tls.rejectUnauthorized;
  }

  // Load CA asynchronously if path is provided
  if (tls.ca) {
    if (typeof tls.ca === 'string' && !tls.ca.includes('-----BEGIN')) {
      try {
        tlsOpts.ca = await readFile(tls.ca);
      } catch {
        tlsOpts.ca = tls.ca;
      }
    } else {
      tlsOpts.ca = tls.ca;
    }
  }

  // Load client certificate asynchronously if path is provided
  if (tls.cert) {
    if (typeof tls.cert === 'string' && !tls.cert.includes('-----BEGIN')) {
      try {
        tlsOpts.cert = await readFile(tls.cert);
      } catch {
        tlsOpts.cert = tls.cert;
      }
    } else {
      tlsOpts.cert = tls.cert;
    }
  }

  // Load private key asynchronously if path is provided
  if (tls.key) {
    if (typeof tls.key === 'string' && !tls.key.includes('-----BEGIN')) {
      try {
        tlsOpts.key = await readFile(tls.key);
      } catch {
        tlsOpts.key = tls.key;
      }
    } else {
      tlsOpts.key = tls.key;
    }
  }

  return tlsOpts;
}

/**
 * Creates an Elasticsearch or OpenSearch client instance.
 * @param {EndpointConfig} endpointConfig - Connection configuration
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

  // TLS / SSL configuration (Promise-based)
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
 * @returns {Promise<ClusterPingResult>}
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
};
