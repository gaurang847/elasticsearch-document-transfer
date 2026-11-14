/**
 * Normalizes and sanitizes Elasticsearch / OpenSearch mapping definitions
 * across major versions (ES 6/7/8 and OpenSearch 1/2).
 * @param {Object} rawMapping - Mapping returned from getMapping API
 * @param {string} sourceIndex - Source index name
 * @returns {Object} Cleaned mappings object suitable for ES 7/8 and OpenSearch
 */
function sanitizeMapping(rawMapping, sourceIndex) {
  const indexMapping = rawMapping[sourceIndex] || rawMapping;
  let mappings = indexMapping.mappings || {};

  // Check if mapping is wrapped inside a legacy type (e.g., { mappings: { my_type: { properties: ... } } })
  const keys = Object.keys(mappings);
  if (keys.length === 1 && typeof mappings[keys[0]] === 'object' && mappings[keys[0]] !== null) {
    const singleKey = keys[0];
    const subObj = mappings[singleKey];
    // If it has 'properties' inside the type key, unwrap it
    if (subObj.properties || subObj._source) {
      mappings = subObj;
    }
  }

  // Clone mapping to avoid mutating input
  const clean = JSON.parse(JSON.stringify(mappings));

  // Remove deprecated Lucene/ES metadata fields
  delete clean._all;
  delete clean._parent;
  delete clean._field_names;
  delete clean._type;

  return clean;
}

/**
 * Extracts reusable analysis settings (analyzers, filters, tokenizers) from index settings.
 * @param {Object} rawSettings
 * @param {string} sourceIndex
 * @returns {Object|undefined}
 */
function extractAnalysisSettings(rawSettings, sourceIndex) {
  const indexSettings = rawSettings[sourceIndex] || rawSettings;
  const analysis = indexSettings.settings?.index?.analysis;
  if (analysis) {
    return { analysis };
  }
  return undefined;
}

/**
 * Transfers mapping and custom analyzers from source to target Elasticsearch/OpenSearch.
 * @param {Object} options
 * @param {Object} options.sourceClient
 * @param {Object} options.targetClient
 * @param {string} options.sourceIndex
 * @param {string} options.targetIndex
 * @param {boolean} [options.copyAnalysis=true]
 */
async function transferMapping({
  sourceClient,
  targetClient,
  sourceIndex,
  targetIndex,
  copyAnalysis = true,
}) {
  // 1. Fetch source mapping
  const sourceMappingResponse = await sourceClient.indices.getMapping({ index: sourceIndex });
  const rawMapping = sourceMappingResponse.body || sourceMappingResponse;
  const sanitized = sanitizeMapping(rawMapping, sourceIndex);

  // 2. Check if target index exists
  const existsResponse = await targetClient.indices.exists({ index: targetIndex });
  const indexExists = typeof existsResponse === 'boolean' ? existsResponse : (existsResponse.body ?? Boolean(existsResponse));

  if (!indexExists) {
    const createBody = {
      mappings: sanitized,
    };

    if (copyAnalysis) {
      try {
        const settingsResponse = await sourceClient.indices.getSettings({ index: sourceIndex });
        const rawSettings = settingsResponse.body || settingsResponse;
        const analysisSettings = extractAnalysisSettings(rawSettings, sourceIndex);
        if (analysisSettings) {
          createBody.settings = analysisSettings;
        }
      } catch (err) {
        // Warning if unable to read settings, but continue
      }
    }

    await targetClient.indices.create({
      index: targetIndex,
      body: createBody,
    });
  } else {
    // If target index exists, update mappings
    const putParams = {
      index: targetIndex,
      body: sanitized,
      properties: sanitized.properties,
    };

    await targetClient.indices.putMapping(putParams);
  }
}

module.exports = {
  sanitizeMapping,
  extractAnalysisSettings,
  transferMapping,
};
